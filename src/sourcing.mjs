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
  spao: ['스파오', 'spao'], 'musinsa standard': ['무신사 스탠다드', 'musinsa standard'], jansport: ['잔스포츠', 'jansport'],
  'black yak': ['블랙야크', 'black yak'], uniqlo: ['유니클로', 'uniqlo'], crocs: ['크록스', 'crocs'],
  apple: ['애플', 'apple'], umbro: ['엄브로', 'umbro'], montbell: ['몽벨', 'montbell'], iab: ['아이앱', 'iab studio'],
};
const STOP = new Set(['발매', '출시', '오픈', '응모', '선착순', '드롭', 'drop', '신상', '컬렉션', 'collection', '한정', '국내', '정식', '제품', '-', 'x', '×']);

export const brandNames = (brand) => BRANDS[brand] ?? [];

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
      ...(Number.isFinite(item.trades) ? { trades: item.trades } : {}),
      ...(item.rank && kream.ranking.includes(item) ? { kreamRank: item.rank } : {}),
    });
  }
  (kream?.fresh ?? []).forEach((item, index) => put(item.id.replace(/^kream:/, ''), { freshRank: index + 1 }));
  for (const [list, items] of Object.entries(trends?.sibnaRank?.lists ?? {})) {
    for (const item of items) {
      const old = byId.get(item.id);
      put(item.id, {
        id: item.id, name: item.name, brand: item.brand, image: old?.image ?? item.image,
        price: old?.price ?? item.price, sibnaPremium: item.vsRetail,
        ...(list === 'new' ? { sibnaNew: true } : {}),
      });
    }
  }
  for (const row of trends?.frequent?.windows?.[7] ?? []) {
    put(row.id, { id: row.id, name: byId.get(row.id)?.name ?? row.name, image: byId.get(row.id)?.image ?? row.image, hits: row.hits, days: row.days });
  }
  const verified = kream?.verified ?? {};
  return [...byId.values()].filter((item) => item.name).map((item) => {
    if (Number.isFinite(item.premium)) return { ...item, premiumSource: 'kream' };
    const v = verified[item.id];
    if (v) return { ...item, premium: v.premiumPct, premiumSource: 'kream', releaseDate: item.releaseDate ?? v.releaseDate };
    if (Number.isFinite(item.sibnaPremium)) return { ...item, premium: item.sibnaPremium, premiumSource: 'sibna' };
    return item;
  });
}

// sibna 정가가 틀린 상품이 있어(예: 8박스 묶음을 1박스 정가와 비교) 확인 전 값은 60%까지만, 그 절반만 반영한다.
const premiumForScore = (item) => (item.premiumSource === 'sibna'
  ? Math.max(-50, Math.min(item.premium, 60)) / 2
  : item.premium);
const premiumReason = (item) => (item.premiumSource === 'sibna'
  ? `sibna 정가 대비 ${pct(item.premium)}(확인 전)`
  : `발매가 대비 ${pct(item.premium)}`);
// 크림 발매가로 확인된 값만 '너무 싸다'고 거른다.
const tooCheap = (item, limit) => item.premiumSource === 'kream' && item.premium <= limit;

const pct = (n) => `${n > 0 ? '+' : ''}${n.toFixed(0)}%`;

/** 이미 크림에 올라온 신상품 중 사 둘 만한 것. 정가보다 많이 싸게 거래되면 뺀다. */
export function recommendProducts(hot, now = new Date(), limit = 15) {
  const recent = kst(new Date(now.getTime() - 60 * 86400000)).date;
  return hot
    .filter((item) => item.freshRank || item.sibnaNew || (item.releaseDate && item.releaseDate >= recent))
    .filter((item) => !tooCheap(item, -10))
    .map((item) => {
      const reasons = [];
      let score = 0;
      if (item.freshRank) { score += item.freshRank <= 10 ? 3 : 1; reasons.push(`크림 뜨는 신상 ${item.freshRank}위`); }
      if (item.sibnaNew) { score += 1; reasons.push('sibna 신규'); }
      if (item.hits) { score += Math.min(item.hits, 6); reasons.push(`7일 중 ${item.days}일 · ${item.hits}회 등장`); }
      if (Number.isFinite(item.premium)) {
        score += premiumForScore(item) > 0 ? Math.min(premiumForScore(item) / 10, 5) : -2;
        reasons.push(premiumReason(item));
      }
      if (item.wishDelta > 0) { score += Math.min(item.wishDelta / 200, 3); reasons.push(`관심 +${item.wishDelta.toLocaleString('ko-KR')}`); }
      return productRec(item, score, reasons);
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function productRec(item, score, reasons) {
  return {
    id: item.id, name: item.name, image: item.image ?? null, price: item.price ?? null,
    premium: Number.isFinite(item.premium) ? Math.round(item.premium * 10) / 10 : null,
    premiumSource: item.premiumSource ?? null,
    trades: item.trades ?? null, releaseDate: item.releaseDate ?? null,
    score: Math.round(score * 10) / 10, reasons,
    links: searchLinks(item.name, { kreamUrl: `https://kream.co.kr/products/${item.id}` }),
    where: whereToBuy(item.name, brandOf(`${item.brand ?? ''} ${item.name}`)),
  };
}

// 공식몰 검색 주소. 확인된 곳만 넣고 나머지는 지도·검색으로 안내한다.
const OFFICIAL_SEARCH = {
  nike: (q) => `https://www.nike.com/kr/w?q=${q}`,
  jordan: (q) => `https://www.nike.com/kr/w?q=${q}`,
  adidas: (q) => `https://www.adidas.co.kr/search?q=${q}`,
  spao: (q) => `https://spao.com/product/search.html?keyword=${q}`,
  'musinsa standard': (q) => `https://www.musinsa.com/search/goods?keyword=${q}`,
};
const BRAND_KO = Object.fromEntries(Object.entries(BRANDS).map(([key, names]) => [key, names[0]]));

/** 발매가 지났거나 품절일 때 구해 볼 곳. 재고가 있는지는 확인하지 않는다. */
export function whereToBuy(name, brand) {
  const q = encodeURIComponent(searchQuery(name));
  const brandName = brand ? BRAND_KO[brand] : '';
  return [
    ...(brand && OFFICIAL_SEARCH[brand] ? [{ label: '공식몰', url: OFFICIAL_SEARCH[brand](q) }] : []),
    ...(brandName ? [{ label: '매장 찾기', url: `https://map.naver.com/p/search/${encodeURIComponent(`${brandName} 매장`)}` }] : []),
    { label: '재입고 소식', url: `https://www.google.com/search?q=${q}%20%EC%9E%AC%EC%9E%85%EA%B3%A0` },
    { label: '번개장터', url: `https://m.bunjang.co.kr/search/products?q=${q}` },
  ];
}

const RESTOCK = /재입고|리스탁|restock|재발매|재판매|추가\s*발매/i;

/** sibna 발매 글 중 재입고·재발매 글이 이 상품(또는 같은 브랜드의 같은 모델)을 가리키면 돌려준다. */
export function findRestock(name, releases) {
  const brand = brandOf(name);
  const want = tokens(searchQuery(name)).filter((word) => brandOf(word) !== brand);
  for (const release of releases) {
    if (!RESTOCK.test(release.title)) continue;
    if (brand && brandOf(release.title) !== brand) continue;
    const have = new Set(tokens(release.title));
    const overlap = want.filter((word) => have.has(word)).length;
    if (overlap >= 2 || (overlap >= 1 && want.length <= 2)) {
      return { title: release.title, date: release.date, time: release.time ?? '', url: release.url };
    }
  }
  return null;
}

/** 싸고(기본 6만 원 이하) 자주 뜨며 거래가 많은 상품. 많이 사서 돌리기 좋은 것. */
export function recommendBudget(hot, { maxPrice = 60000, limit = 15 } = {}) {
  return hot
    .filter((item) => Number.isFinite(item.price) && item.price > 0 && item.price <= maxPrice)
    .filter((item) => !tooCheap(item, -40))
    .map((item) => {
      const reasons = [];
      let score = 0;
      if (item.hits) { score += Math.min(item.hits, 6); reasons.push(`7일 중 ${item.days}일 · ${item.hits}회 등장`); }
      if (item.trades) { score += Math.min(item.trades / 1000, 5); reasons.push(`누적 거래 ${item.trades.toLocaleString('ko-KR')}`); }
      if (item.kreamRank) { score += item.kreamRank <= 10 ? 3 : item.kreamRank <= 30 ? 1.5 : 0.5; reasons.push(`크림 랭킹 ${item.kreamRank}위`); }
      if (item.freshRank) { score += 1; reasons.push(`뜨는 신상 ${item.freshRank}위`); }
      if (Number.isFinite(item.premium)) {
        score += premiumForScore(item) > 0 ? Math.min(premiumForScore(item) / 10, 3) : 0;
        reasons.push(premiumReason(item));
      }
      return productRec(item, score, reasons);
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 이미 발매된 추천 상품에 리스탁 소식을 붙인다. */
export function attachRestock(items, releases) {
  for (const item of items) item.restock = findRestock(item.name, releases);
  return items;
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
        const p = premiumForScore(similar);
        score += p > 0 ? 3 + Math.min(p / 30, 3) : -1;
        reasons.push(`비슷한 크림 상품 ${premiumReason(similar)}`);
      }
      if (item.watched) { score += 2; reasons.push('관심 키워드'); }
      if (item.method === '응모') { score += 1; reasons.push('응모(한정 수량)'); }
      return {
        id: item.id, name: item.title, image: item.image ?? null, date: item.date, time: item.time ?? '', method: item.method ?? '',
        score: Math.round(score * 10) / 10, reasons,
        similar: similar ? { name: similar.name, url: `https://kream.co.kr/products/${similar.id}`, premium: similar.premium ?? null, premiumSource: similar.premiumSource ?? null } : null,
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
