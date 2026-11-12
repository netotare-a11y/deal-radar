import { decodeEntities, fetchText, kst, safeUrl, stripTags } from '../lib/util.mjs';

const RANK_URL = 'https://sibna.kr/today/kream_rank';
export const SIBNA_LISTS = { sales: '거래 활발', premium: '프리미엄', under: '정가 이하', new: '신규' };
const REFETCH_MS = 3 * 60 * 60 * 1000;
const KEEP_DAYS = 8;

const marketValue = (card, label) => card.match(new RegExp(`<span>${label}</span><strong>([\\s\\S]*?)</strong>`))?.[1];

/** sibna 상품 번호는 KREAM 상품 번호와 같다. */
export function parseKreamRank(html) {
  const lists = {};
  const panels = html.split(/data-rank-panel="/).slice(1);
  for (const panel of panels) {
    const key = panel.match(/^(\w+)"/)?.[1];
    if (!SIBNA_LISTS[key]) continue;
    const cards = panel.split(/<a class="[^"]*\bkm-rank-card\b[^"]*" href="/).slice(1);
    lists[key] = cards.map((card, index) => {
      const id = card.match(/^https:\/\/sibna\.kr\/today\/kream\/(\d+)-/)?.[1];
      const name = card.match(/km-card-name[^>]*><span class="km-marquee-text">([\s\S]*?)<\/span>/)?.[1];
      if (!id || !name) return null;
      // 메인은 '최근거래가', 랭킹 페이지는 '대표관측가'로 표시한다.
      const price = (marketValue(card, '대표관측가') ?? marketValue(card, '최근거래가'))?.replace(/[^\d]/g, '');
      const vsRetail = Number.parseFloat(marketValue(card, '정가대비') ?? '');
      return {
        id,
        rank: Number(card.match(/km-rank-no">#(\d+)/)?.[1] ?? index + 1),
        name: decodeEntities(name).trim(),
        brand: stripTags(card.match(/km-card-sub[^>]*><span class="km-marquee-text">([\s\S]*?)<\/span>/)?.[1] ?? '').split('·')[0].trim(),
        image: safeUrl(card.match(/<img src="([^"]+)"/)?.[1]),
        price: price ? Number(price) : null,
        activity: stripTags(marketValue(card, '활발도') ?? ''),
        vsRetail: Number.isFinite(vsRetail) ? vsRetail : null,
      };
    }).filter(Boolean);
  }
  return lists;
}

/** 하루에 한 기록(그날의 마지막)만 남겨 최근 8일치를 유지한다. */
export function mergeDaily(previous, lists, now) {
  const date = kst(now).date;
  const ids = Object.fromEntries(Object.entries(lists).map(([key, items]) => [key, items.map((item) => item.id)]));
  const history = (previous?.history ?? []).filter((day) => day.date !== date);
  history.push({ date, lists: ids });
  history.sort((a, b) => a.date.localeCompare(b.date));
  const kept = history.slice(-KEEP_DAYS);

  // 기록에 남은 상품의 이름·이미지는 최신 값을 쓰고, 오늘 안 보인 상품은 이전 값을 유지한다.
  const keepIds = new Set(kept.flatMap((day) => Object.values(day.lists).flat()));
  const products = {};
  for (const [id, info] of Object.entries(previous?.products ?? {})) if (keepIds.has(id)) products[id] = info;
  for (const items of Object.values(lists)) {
    for (const { rank, ...item } of items) products[item.id] = item;
  }
  return { fetchedAt: now.toISOString(), lists, history: kept, products };
}

/** 3시간 안에 받은 기록이 있으면 다시 요청하지 않는다. */
export async function collectSibnaKream(previous, now = new Date()) {
  if (previous?.fetchedAt && now - Date.parse(previous.fetchedAt) < REFETCH_MS) return previous;
  const lists = parseKreamRank(await fetchText(RANK_URL));
  if (Object.values(lists).flat().length < 10) throw new Error('sibna 크림 랭킹 구조가 바뀐 것 같습니다.');
  return mergeDaily(previous, lists, now);
}
