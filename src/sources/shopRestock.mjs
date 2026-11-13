/**
 * 공홈(Shopify) 재입고 감시.
 * Shopify 공홈은 /products.json 에 상품별 사이즈 재고(available)를, /meta.json 에 상점 이름·통화를 공개한다.
 * 직전 실행의 재고와 견줘 "전부 품절 → 다시 구매 가능"(재입고)과 "새로 올라온 상품"을 찾는다.
 */

const PAGE_SIZE = 250;
const MAX_PAGES = 4;
const KEEP_MS = 3 * 24 * 3600 * 1000;
const MAX_EVENTS = 40;
const ALERT_MS = 24 * 3600 * 1000;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'deal-radar/1.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

export async function fetchShop(storeUrl) {
  const origin = new URL(storeUrl).origin;
  const meta = await getJson(`${origin}/meta.json`).catch(() => ({}));
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const list = (await getJson(`${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`)).products ?? [];
    products.push(...list);
    if (list.length < PAGE_SIZE) break;
  }
  return { origin, name: meta.name || new URL(origin).host, currency: meta.currency || 'USD', products };
}

/** 상품별로 지금 살 수 있는 사이즈(variant id) 목록. 다음 실행과 견주려고 feed.json 에 남긴다. */
export const stockOf = (products) => Object.fromEntries(
  products.map((p) => [p.handle, (p.variants ?? []).filter((v) => v.available).map((v) => v.id)]),
);

/** 직전 재고(before)가 없으면 첫 실행이라 아무것도 알리지 않는다. */
export function findRestocks(before, shop, now) {
  if (!before) return [];
  const events = [];
  for (const p of shop.products) {
    const variants = p.variants ?? [];
    const avail = variants.filter((v) => v.available);
    if (!avail.length) continue;
    const old = before[p.handle];
    const kind = old === undefined ? 'new' : old.length === 0 ? 'restock' : null;
    if (!kind) continue;
    events.push({
      id: `shop:${new URL(shop.origin).host}:${p.handle}:${Date.parse(now.toISOString()).toString(36)}`,
      kind,
      store: shop.name,
      storeUrl: shop.origin,
      title: p.title,
      type: p.product_type ?? '',
      url: `${shop.origin}/products/${p.handle}`,
      image: p.images?.[0]?.src ?? null,
      price: Number(avail[0].price),
      currency: shop.currency,
      sizes: avail.map((v) => v.title),
      nowSizes: avail.map((v) => v.title),
      total: variants.length,
      at: now.toISOString(),
    });
  }
  return events;
}

const GENERIC = new Set(['the', 'and', 'hoodie', 'zip', 'tee', 'shirt', 'case', 'cap', 'hat', 'pant', 'pants', 'jacket', 'sock', 'socks', 'black', 'white', 'grey', 'gray']);
const words = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').split(' ').filter((w) => w.length >= 3);

/**
 * 딜레이더가 모은 크림 인기 목록(hot: 크림 랭킹·뜨는 신상·관심 급증·sibna 목록)에서 같은 상품을 찾아 추천 정도를 매긴다.
 * shortcut: 크림 전체가 아니라 인기 목록 안에서만 찾는다. 목록에 없으면 '크림 기록 없음'으로 두고 검색 버튼을 준다.
 */
export function kreamVerdict(event, hot, fx = {}) {
  const brand = words(event.store)[0] ?? '';
  const own = words(event.title).filter((w) => w !== brand && !GENERIC.has(w));
  const sameBrand = brand ? hot.filter((h) => `${h.name} ${h.brand ?? ''}`.toLowerCase().includes(brand)) : [];
  let match = null;
  let best = 0;
  for (const h of sameBrand) {
    const name = h.name.toLowerCase();
    const shared = own.filter((w) => name.includes(w)).length;
    if (shared > best) { best = shared; match = h; }
  }
  const rate = fx[event.currency] ?? (event.currency === 'KRW' ? 1 : null);
  const retailKrw = rate && Number.isFinite(event.price) ? Math.round(event.price * rate) : null;
  const reasons = [];
  let level = 'unknown';
  let kream = null;
  if (match) {
    kream = {
      id: match.id, name: match.name, url: `https://kream.co.kr/products/${match.id}`, price: match.price,
      premium: match.premium, premiumSource: match.premiumSource,
    };
    const hotSignal = match.kreamRank || match.freshRank || match.hits >= 3 || match.wishDelta > 0;
    if (match.kreamRank) reasons.push(`크림 인기 랭킹 ${match.kreamRank}위`);
    if (match.freshRank) reasons.push(`크림 뜨는 신상 ${match.freshRank}위`);
    if (match.wishDelta > 0) reasons.push(`크림 관심 +${match.wishDelta.toLocaleString('ko-KR')}`);
    if (match.hits) reasons.push(`최근 7일 중 ${match.days}일, ${match.hits}번 인기 목록에 등장`);
    if (Number.isFinite(match.trades)) reasons.push(`크림 누적 거래 ${match.trades.toLocaleString('ko-KR')}건`);
    if (retailKrw && Number.isFinite(match.price)) {
      kream.margin = Math.round(((match.price - retailKrw) / retailKrw) * 100);
      reasons.push(`크림 ${match.price.toLocaleString('ko-KR')}원 vs 공홈 약 ${retailKrw.toLocaleString('ko-KR')}원 (${kream.margin > 0 ? '+' : ''}${kream.margin}%, 배송비·관세 빼고)`);
    }
    level = hotSignal || kream.margin >= 15 ? 'buy' : 'check';
  } else if (sameBrand.length) {
    level = 'check';
    reasons.push(`크림 인기 목록에 ${event.store} 상품 ${sameBrand.length}개 (이 상품은 없음)`);
  } else {
    reasons.push('크림 인기 목록(랭킹·뜨는 신상·sibna)에 없음. 크림 검색으로 시세를 확인하세요.');
  }
  return { level, reasons, kream, retailKrw };
}

/** 가게마다 받아 재고를 견주고, 최근 3일 이벤트를 이어 붙인다. 한 가게가 실패하면 그 가게는 직전 재고를 유지한다. */
export async function collectShopRestock(stores, previous = {}, now = new Date(), load = fetchShop) {
  const stock = { ...previous.stock };
  const fresh = [];
  const errors = [];
  const summary = [];
  const cutoff = now.getTime() - KEEP_MS;
  const kept = (previous.events ?? []).filter((e) => Date.parse(e.at) >= cutoff);
  for (const store of stores) {
    const host = new URL(store.url).host;
    try {
      const shop = await load(store.url);
      fresh.push(...findRestocks(previous.stock?.[host], shop, now));
      stock[host] = stockOf(shop.products);
      // 발견한 뒤 팔려 나간 것을 반영한다. 목록에서 사라진 상품도 품절로 본다.
      for (const event of kept.filter((e) => e.storeUrl === shop.origin)) {
        const p = shop.products.find((item) => `${shop.origin}/products/${item.handle}` === event.url);
        event.nowSizes = (p?.variants ?? []).filter((v) => v.available).map((v) => v.title);
        event.checkedAt = now.toISOString();
        if (!event.nowSizes.length) event.soldOutAt ??= now.toISOString();
        else delete event.soldOutAt;
      }
      // shortcut: 가격은 접속한 나라의 통화로 올 수 있다(한국에서 받으면 원화). 깃허브 서버(미국)에서는 상점 통화와 같다고 본다.
      summary.push({
        host, name: shop.name, url: shop.origin, currency: shop.currency, count: shop.products.length,
        samplePrice: shop.products[0]?.variants?.[0]?.price ?? null,
        soldOut: shop.products.filter((p) => !(p.variants ?? []).some((v) => v.available))
          .map((p) => ({ title: p.title, url: `${shop.origin}/products/${p.handle}`, image: p.images?.[0]?.src ?? null })),
      });
    } catch (error) {
      errors.push(`${host}: ${error.message}`);
      const old = previous.stores?.find((s) => s.host === host);
      if (old) summary.push(old);
    }
  }
  if (errors.length === stores.length && stores.length) throw new Error(errors.join(', '));
  const events = [...fresh, ...kept].slice(0, MAX_EVENTS);
  return { stock, events, errors, stores: summary };
}

const money = (e) => (e.currency === 'KRW' ? `${e.price.toLocaleString('ko-KR')}원` : `${e.currency} ${e.price}`);
const LEVEL_TEXT = { buy: '크림 인기 · 추천', check: '크림 확인 필요', unknown: '크림 기록 없음' };

/** 앱 알림용. 재입고는 늘 알리고, 새 상품은 크림에서 근거가 있을 때만 알린다. */
export function shopAlerts(events, now = new Date()) {
  return events
    .filter((e) => now.getTime() - Date.parse(e.at) < ALERT_MS)
    .filter((e) => e.kind === 'restock' || e.verdict?.level !== 'unknown')
    .map((e) => ({
      id: e.id,
      kind: 'kream',
      name: `${e.kind === 'restock' ? '공홈 재입고' : '공홈 새 상품'} · ${e.store} ${e.title} · ${LEVEL_TEXT[e.verdict?.level ?? 'unknown']}`,
      store: e.store,
      price: money(e),
      url: e.url,
      recommend: 0,
      watched: false,
      alert: true,
    }));
}
