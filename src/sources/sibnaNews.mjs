import { brandHeat, brandOf, searchLinks, similarProduct } from '../sourcing.mjs';
import { addDays, fetchText, kst, matchesAny, stripTags } from '../lib/util.mjs';
import { sizeAdvice } from '../sizes.mjs';

const BASE = 'https://sibna.kr/today/news';
const REFETCH_MS = 3 * 60 * 60 * 1000;
const LIMIT = 5;

// 살 수 있는 상품이 나오는 분야와, 웃돈 근거로만 쓰는 분야.
const BUY_SECTIONS = ['오늘 꼭 볼 것', '스니커즈·발매', '스트리트·패션', '국내 발매·응모', 'TCG', '컬렉터블'];
const EVIDENCE_SECTIONS = ['KREAM 거래 동향', '해외 거래 동향', '오늘의 시장 체크'];
// 상품 구매가 아닌 소식(행사·팝업·실적·할인 행사·일정 요약 등).
const NOT_BUY = /팝업|행사|개점|블랙프라이데이|매출|영업이익|주가|실적|체험|커뮤니티\s*런|임시\s*매장|정보\s*공개|일정\s*\d+건|일정\s*(연결|동시|분산)|시즌그리팅|와인|홀케이크|스테이션|리더십/;

const clean = (s) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
const words = (text) => String(text ?? '').toLowerCase().replace(/[()[\]{}·,/&'"‘’“”!?:+|｜]/g, ' ').split(/\s+/)
  .filter((w) => w.length >= 2 && !['x', '×', '발매', '국내', '가격', '선착순', '응모', '신상품', '컬렉션'].includes(w));

/** 발매뉴스 본문을 분야(h2)·항목(h3)·설명(p)으로 나눈다. */
export function parseNewsArticle(html) {
  const start = html.indexOf('id="resellNewsBody"');
  if (start < 0) return [];
  const body = html.slice(start);
  const items = [];
  for (const part of body.split('<h2>').slice(1)) {
    const section = clean(stripTags(part.slice(0, part.indexOf('</h2>'))));
    for (const [, id, title, text] of part.matchAll(/<h3(?: id="([^"]+)")?>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)) {
      items.push({ section, id: id ?? '', title: stripTags(title), text: stripTags(text) });
    }
  }
  return items;
}

const overlap = (a, b) => {
  const want = words(a);
  const have = new Set(words(b));
  return want.length ? want.filter((w) => have.has(w)).length / want.length : 0;
};

/** 근거 글에서 웃돈(정가보다 n% 높음) 또는 정가 이하 신호를 읽는다. */
export function readEvidence(item) {
  const highs = [...item.text.matchAll(/약\s*([\d.]+)%(?:,|\s)*(?:최근 평균은 약\s*([\d.]+)%\s*)?높/g)];
  const pcts = highs.flatMap((m) => [m[1], m[2]]).filter(Boolean).map(Number);
  if (pcts.length) return { premium: Math.max(...pcts), title: item.title };
  if (/정가\s*이하|낮습니다/.test(`${item.title} ${item.text}`)) return { below: true, title: item.title };
  return null;
}

/**
 * 오늘 기사에서 꼭 살 만한 것을 고른다.
 * 점수: sibna가 꼭 볼 것으로 꼽음, 해외·크림 웃돈 근거, 응모·협업, 요즘 뜨는 브랜드, 비슷한 크림 상품 웃돈, 관심 키워드.
 */
export function pickNews(items, { hot = [], releases = [], watchKeywords = [], url = '' } = {}) {
  const evidence = items.filter((i) => EVIDENCE_SECTIONS.includes(i.section));
  const heat = brandHeat(hot);
  const candidates = [];
  for (const item of items.filter((i) => BUY_SECTIONS.includes(i.section) && !NOT_BUY.test(`${i.title} ${i.text.slice(0, 60)}`))) {
    const same = candidates.find((c) => overlap(c.title, item.title) >= 0.6 && overlap(item.title, c.title) >= 0.6);
    if (same) {
      same.highlighted ||= item.section === '오늘 꼭 볼 것';
      same.text += ` ${item.text}`;
      if (same.section === '오늘 꼭 볼 것') Object.assign(same, { section: item.section });
      continue;
    }
    candidates.push({ ...item, highlighted: item.section === '오늘 꼭 볼 것' });
  }

  const picks = candidates.map((c) => {
    const reasons = [];
    const cautions = [];
    let score = 0;
    let strong = false; // 브랜드 인기만으로는 '알짜'로 보지 않는다.
    if (c.highlighted) { strong = true; score += 2; reasons.push("sibna가 '오늘 꼭 볼 것'으로 꼽았어요."); }

    const ev = evidence.filter((e) => overlap(c.title, e.title) >= 0.6 || overlap(c.title, e.text) >= 0.75).map(readEvidence).filter(Boolean);
    const up = ev.filter((e) => e.premium).sort((a, b) => b.premium - a.premium)[0];
    if (up) { strong = true; score += 2 + Math.min(up.premium / 15, 4); reasons.push(`해외·크림 시세가 정가보다 약 ${up.premium}% 높게 형성돼 있어요. (${up.title})`); }
    if (!up && ev.some((e) => e.below)) { score -= 2; cautions.push('기사에 정가 이하 거래 흐름이 있어요.'); }

    // 다른 상품 이야기가 섞이지 않게 첫 문장으로 판매 방식을 본다(예: '신발 응모와 의류 선착순').
    const first = c.text.split(/(?<=다\.)\s/)[0];
    const draw = /응모/.test(first) && !/선착순/.test(first);
    if (draw) { strong = true; score += 1.5; reasons.push('응모 방식이라 풀리는 수량이 적어요. 당첨돼야 살 수 있어요.'); }
    if (/\sx\s|×|협업/i.test(`${c.title} ${c.text.slice(0, 80)}`)) { strong = true; score += 1; reasons.push('브랜드 협업 상품이에요. 협업은 보통 리셀 수요가 높아요.'); }

    const price = c.text.match(/국내\s*가격(?:은)?\s*([\d,]+)원/)?.[1];
    if (price) reasons.push(`국내 가격은 ${price}원이에요.`);

    const brand = brandOf(c.title);
    const h = brand && heat.get(brand);
    if (h) { score += Math.min(h.count / 4, 2) + Math.min(h.premium / 3, 2); reasons.push(`요즘 크림·sibna에서 ${brand} 상품이 ${h.count}개 뜨고 그중 ${h.premium}개는 웃돈이 붙어 있어요.`); }
    const similar = similarProduct(c.title, hot);
    if (similar && similar.premium > 0 && similar.premiumSource === 'kream') {
      strong = true;
      score += Math.min(similar.premium / 20, 3);
      reasons.push(`비슷한 크림 상품(${similar.name})이 발매가보다 ${Math.round(similar.premium)}% 비싸게 거래돼요.`);
    }
    if (matchesAny(c.title, watchKeywords)) { score += 0.5; reasons.push('관심 키워드에 걸리는 상품이에요.'); }
    if (/확인되지\s*않|확인하지\s*못/.test(c.text)) cautions.push('가격이나 품번 일부는 기사에서 확인되지 않았어요.');
    if (/북미|영문판|해외\s*기준/.test(c.text)) cautions.push('해외 발매 일정이에요. 국내 구매 방법을 따로 확인해야 해요.');

    // 같은 상품의 sibna 발매 글이 있으면 발매처·시간을 붙인다.
    const release = releases.map((r) => ({ r, s: Math.max(overlap(c.title, r.title), overlap(r.title, c.title)) }))
      .filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s)[0]?.r;
    return {
      id: release?.id ?? `news:${c.id}`,
      name: c.title,
      section: c.section,
      summary: c.text.split(/(?<=다\.)\s/)[0],
      newsUrl: c.id ? `${url}#${c.id}` : url,
      date: release?.date ?? null, time: release?.time ?? '', method: release?.method ?? (draw ? '응모' : /선착순/.test(first) ? '선착순' : ''),
      postUrl: release?.url ?? null,
      image: release?.image ?? null,
      score: Math.round(score * 10) / 10,
      strong,
      reasons, cautions,
      fit: similar?.fit?.basis === 'trades' ? { ...similar.fit, from: similar.name } : sizeAdvice(c.title, []),
      links: searchLinks(c.title),
    };
  });
  return picks.filter((p) => p.strong && p.score >= 3).sort((a, b) => b.score - a.score).slice(0, LIMIT);
}

/** 오늘(KST) 기사를 받고, 아직 안 올라왔으면 어제 기사를 쓴다. 3시간 안에 받은 게 있으면 다시 받지 않는다. */
export async function collectSibnaNews(previous, now = new Date()) {
  const today = kst(now).date;
  if (previous?.fetchedAt && previous.date === today && now - Date.parse(previous.fetchedAt) < REFETCH_MS) return previous;
  for (const date of [today, addDays(today, -1)]) {
    const url = `${BASE}/${date.replaceAll('-', '')}`;
    try {
      const items = parseNewsArticle(await fetchText(url, { retries: 0 }));
      if (items.length >= 5) return { date, url, fetchedAt: now.toISOString(), items };
    } catch {
      // 오늘 기사가 아직 없으면 어제 것을 본다.
    }
  }
  throw new Error('sibna 발매뉴스를 찾지 못했습니다.');
}
