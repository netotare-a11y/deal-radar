import { decodeEntities, fetchText, kst, safeUrl, sleep, stripTags } from './lib/util.mjs';

// 발매 글은 한글 브랜드명, 크림·sibna 상품은 영문 브랜드명이 섞여 있어 둘을 이어 준다.
const BRANDS = {
  nike: ['나이키', 'nike'], jordan: ['조던', 'jordan'], adidas: ['아디다스', 'adidas'],
  'new balance': ['뉴발란스', 'new balance', 'new-balance'], asics: ['아식스', 'asics'], salomon: ['살로몬', 'salomon'],
  vans: ['반스', 'vans'], converse: ['컨버스', 'converse'], supreme: ['슈프림', 'supreme'], stussy: ['스투시', 'stussy'],
  palace: ['팔라스', 'palace'], 'the north face': ['노스페이스', 'north face', 'the-north-face'], puma: ['푸마', 'puma'],
  hoka: ['호카', 'hoka'], onitsuka: ['오니츠카', 'onitsuka'], arcteryx: ['아크테릭스', "arc'teryx", 'arcteryx'],
  pokemon: ['포켓몬', 'pokemon'], lego: ['레고', 'lego'], carhartt: ['칼하트', '카하트', 'carhartt'],
  'new era': ['뉴에라', 'new era', 'new-era'], ugg: ['어그', 'ugg'], 'matin kim': ['마뗑킴', 'matin kim'],
  apple: ['애플', 'apple'], umbro: ['엄브로', 'umbro'], montbell: ['몽벨', 'montbell'], iab: ['아이앱', 'iab studio'],
};
const STOP = new Set(['발매', '출시', '오픈', '응모', '선착순', '드롭', 'drop', '신상', '컬렉션', 'collection', '한정', '국내', '정식', '제품', '-', 'x', '×']);

export function brandOf(text) {
  const lower = String(text ?? '').toLowerCase();
  return Object.entries(BRANDS).find(([, names]) => names.some((name) => lower.includes(name)))?.[0] ?? null;
}

const tokens = (text) => String(text ?? '').toLowerCase()
  .replace(/[()[\]{}·,/&'"!?:+]/g, ' ')
  .split(/\s+/)
  .filter((word) => word.length >= 2 && !STOP.has(word));

/** 검색어용: 앞쪽 '카시나)' 같은 매장 표시와 '발매' 같은 말을 뺀다. */
export function searchQuery(title) {
  return String(title ?? '')
    .replace(/^[^)]{1,12}\)\s*/, '')
    .replace(/\s*(발매|출시|오픈|응모|선착순|드롭)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchLinks(name, { kreamUrl = null } = {}) {
  const q = encodeURIComponent(searchQuery(name));
  return [
    { label: '크림', url: kreamUrl ?? `https://kream.co.kr/search?keyword=${q}` },
    { label: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${q}` },
    { label: '무신사', url: `https://www.musinsa.com/search/goods?keyword=${q}` },
    { label: '구글', url: `https://www.google.com/search?q=${q}%20%EB%B0%9C%EB%A7%A4%EC%B2%98` },
  ];
}

/** 크림·sibna에서 뜨는 상품을 하나의 목록으로 모은다. */
export function hotProducts(trends) {
  const byId = new Map();
  const put = (id, patch) => byId.set(String(id), { ...byId.get(String(id)), ...patch });
  const kream = trends?.kream;
  for (const item of [...(kream?.ranking ?? []), ...(kream?.fresh ?? []), ...(kream?.wishRisers ?? []), ...(kream?.premium ?? [])]) {
    const id = item.id.replace(/^kream:/, '');
    put(id, {
      id, name: byId.get(id)?.name ?? item.name, image: item.image, price: item.price,
      premium: Number.isFinite(item.premiumPct) ? item.premiumPct : byId.get(id)?.premium,
      wishDelta: item.wishDelta ?? byId.get(id)?.wishDelta ?? null,
      releaseDate: item.releaseDate ?? byId.get(id)?.releaseDate ?? null,
    });
  }
  (kream?.fresh ?? []).forEach((item, index) => put(item.id.replace(/^kream:/, ''), { freshRank: index + 1 }));
  for (const [list, items] of Object.entries(trends?.sibnaRank?.lists ?? {})) {
    for (const item of items) {
      const old = byId.get(item.id);
      put(item.id, {
        id: item.id, name: item.name, brand: item.brand, image: old?.image ?? item.image,
        price: old?.price ?? item.price, premium: old?.premium ?? item.vsRetail,
        ...(list === 'new' ? { sibnaNew: true } : {}),
      });
    }
  }
  for (const row of trends?.frequent?.windows?.[7] ?? []) {
    put(row.id, { id: row.id, name: byId.get(row.id)?.name ?? row.name, image: byId.get(row.id)?.image ?? row.image, hits: row.hits, days: row.days });
  }
  return [...byId.values()].filter((item) => item.name);
}

const pct = (n) => `${n > 0 ? '+' : ''}${n.toFixed(0)}%`;

/** 이미 크림에 올라온 신상품 중 사 둘 만한 것. 정가보다 많이 싸게 거래되면 뺀다. */
export function recommendProducts(hot, now = new Date(), limit = 15) {
  const recent = kst(new Date(now.getTime() - 60 * 86400000)).date;
  return hot
    .filter((item) => item.freshRank || item.sibnaNew || (item.releaseDate && item.releaseDate >= recent))
    .filter((item) => !(item.premium <= -10))
    .map((item) => {
      const reasons = [];
      let score = 0;
      if (item.freshRank) { score += item.freshRank <= 10 ? 3 : 1; reasons.push(`크림 뜨는 신상 ${item.freshRank}위`); }
      if (item.sibnaNew) { score += 1; reasons.push('sibna 신규'); }
      if (item.hits) { score += Math.min(item.hits, 6); reasons.push(`7일 중 ${item.days}일 · ${item.hits}회 등장`); }
      if (Number.isFinite(item.premium)) {
        score += item.premium > 0 ? Math.min(item.premium / 10, 5) : -2;
        reasons.push(`정가 대비 ${pct(item.premium)}`);
      }
      if (item.wishDelta > 0) { score += Math.min(item.wishDelta / 200, 3); reasons.push(`관심 +${item.wishDelta.toLocaleString('ko-KR')}`); }
      return {
        id: item.id, name: item.name, image: item.image ?? null, price: item.price ?? null,
        score: Math.round(score * 10) / 10, reasons,
        links: searchLinks(item.name, { kreamUrl: `https://kream.co.kr/products/${item.id}` }),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 이름에 겹치는 낱말이 많으면 같은 상품으로 본다. 추정이라 화면에 '비슷한 상품'으로만 보여 준다. */
export function similarProduct(title, hot) {
  const want = tokens(searchQuery(title));
  if (want.length < 2) return null;
  let best = null;
  for (const item of hot) {
    const have = new Set(tokens(item.name));
    const overlap = want.filter((word) => have.has(word)).length;
    const ratio = overlap / want.length;
    if (overlap >= 2 && ratio >= 0.6 && (!best || ratio > best.ratio)) best = { item, ratio };
  }
  return best?.item ?? null;
}

/** 다가올 발매 중 크림·sibna 흐름으로 볼 때 노려 볼 만한 것. */
export function recommendReleases(releases, hot, now = new Date(), limit = 12) {
  const { date: today, time } = kst(now);
  const heat = new Map();
  for (const item of hot) {
    const brand = brandOf(`${item.brand ?? ''} ${item.name}`);
    if (!brand) continue;
    const h = heat.get(brand) ?? { count: 0, premium: 0 };
    h.count += 1;
    if (item.premium > 0) h.premium += 1;
    heat.set(brand, h);
  }

  return releases
    .filter((item) => item.date > today || (item.date === today && (!item.time || item.time >= time)))
    .map((item) => {
      const reasons = [];
      let score = 0;
      const brand = brandOf(item.title);
      const h = brand && heat.get(brand);
      if (h) {
        score += Math.min(h.count / 3, 3) + Math.min(h.premium / 2, 2);
        reasons.push(`요즘 뜨는 브랜드 (${brand} ${h.count}개, 웃돈 ${h.premium}개)`);
      }
      const similar = similarProduct(item.title, hot);
      if (similar && Number.isFinite(similar.premium)) {
        score += similar.premium > 0 ? 3 + Math.min(similar.premium / 30, 3) : -1;
        reasons.push(`비슷한 크림 상품 정가 대비 ${pct(similar.premium)}`);
      }
      if (item.watched) { score += 2; reasons.push('관심 키워드'); }
      if (item.method === '응모') { score += 1; reasons.push('응모(한정 수량)'); }
      return {
        id: item.id, name: item.title, image: item.image ?? null, date: item.date, time: item.time ?? '', method: item.method ?? '',
        score: Math.round(score * 10) / 10, reasons,
        similar: similar ? { name: similar.name, url: `https://kream.co.kr/products/${similar.id}`, premium: similar.premium ?? null } : null,
        postUrl: item.url,
        links: searchLinks(item.title),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** sibna 발매 글의 '바로가기' 칸에서 발매처 링크를 읽는다. */
export function parseStoreLinks(html) {
  const section = html.match(/<section class="release-store-links"[\s\S]*?<\/section>/)?.[0] ?? '';
  const links = [];
  for (const [, href, body] of section.matchAll(/<a class="release-store-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = safeUrl(decodeEntities(href));
    const label = stripTags(body.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] ?? '');
    // 'sibna.kr'로만 표시된 대표 링크는 어디로 가는지 이름이 없어 '바로가기'로 부른다.
    if (url) links.push({ label: label && label !== 'sibna.kr' ? label : '바로가기', url });
  }
  return links;
}

/** 추천된 발매만 글을 열어 발매처 링크를 붙인다. 이미 읽은 글은 다시 요청하지 않는다. */
export async function attachStoreLinks(recommended, cache = {}) {
  const next = {};
  for (const item of recommended) {
    if (!cache[item.id]) {
      try {
        cache[item.id] = parseStoreLinks(await fetchText(item.postUrl));
        await sleep(400);
      } catch (error) {
        console.error(`[store] ${item.id}: ${error.message}`);
        cache[item.id] = null;
      }
    }
    if (cache[item.id]) next[item.id] = cache[item.id];
    item.storeLinks = cache[item.id] ?? [];
  }
  return next;
}
