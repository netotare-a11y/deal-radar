import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeUrl } from './lib/util.mjs';
import { sizeAdvice } from './sizes.mjs';

const MIN_BASELINE_AGE_MS = 60 * 60 * 1000;
const DAY_BASELINE_AGE_MS = 20 * 60 * 60 * 1000;
const STALE_RISER_LIMIT = 15;

/** 하루 전에 가장 가까운 기록을 고르고, 아직 없으면 1시간 이상 지난 가장 오래된 기록을 쓴다. */
export function pickBaseline(history, updatedAt) {
  const latest = Date.parse(updatedAt);
  const older = (history ?? []).filter((entry) => latest - Date.parse(entry.at) >= MIN_BASELINE_AGE_MS);
  if (!older.length) return null;
  const dayOld = older.filter((entry) => latest - Date.parse(entry.at) >= DAY_BASELINE_AGE_MS);
  return dayOld.length ? dayOld.at(-1) : older[0];
}

function cleanItem(site, item) {
  const url = safeUrl(item.url);
  if (!url || !item.name) return null;
  return {
    id: `${site}:${item.id}`,
    name: String(item.name),
    url,
    image: safeUrl(item.image),
    price: Number.isFinite(item.price) ? item.price : null,
  };
}

/** 상품 페이지 기록: 관심수 증가(하루 전 또는 1시간 이상 전 대비), 발매가 대비 시세. */
export function detailStats(detail, price) {
  if (!detail) return {};
  const wishes = (detail.wishes ?? []).map(([at, wish]) => ({ at, wish }));
  const latest = wishes.at(-1);
  const base = latest ? pickBaseline(wishes, latest.at) : null;
  const wishDelta = base && Number.isFinite(latest.wish) && Number.isFinite(base.wish) ? latest.wish - base.wish : null;
  const now = Number.isFinite(detail.price) ? detail.price : price;
  const premiumPct = detail.releasePrice > 0 && Number.isFinite(now)
    ? ((now - detail.releasePrice) / detail.releasePrice) * 100
    : null;
  return {
    wish: detail.wish ?? null,
    wishDelta,
    wishGrowth: wishDelta !== null && base.wish > 0 ? (wishDelta / base.wish) * 100 : null,
    wishSince: base?.at ?? null,
    releasePrice: detail.releasePrice ?? null,
    releaseDate: detail.releaseDate ?? null,
    premiumPct,
    changePct: detail.changePct ?? null,
    badge: String(detail.badge ?? ''),
    fit: sizeAdvice(detail.name, detail.tradeLog),
    ...(Number.isFinite(detail.price) ? { price: detail.price } : {}),
  };
}

export function buildKreamTrend(file) {
  if (!file?.items?.length) return null;
  const baseline = pickBaseline(file.history, file.updatedAt);
  const details = file.details ?? {};

  const items = file.items.map((raw) => {
    const item = cleanItem('kream', raw);
    if (!item) return null;
    const before = baseline?.items?.[raw.id];
    const beforeTrades = before?.[1];
    const tradesDelta = Number.isFinite(raw.trades) && Number.isFinite(beforeTrades)
      ? raw.trades - beforeTrades
      : null;
    return {
      ...item,
      rank: raw.rank,
      rankChange: raw.rankChange ?? 0,
      isNewRank: Boolean(raw.isNewRank),
      trades: raw.trades ?? null,
      tradesDelta,
      tradesGrowth: tradesDelta !== null && beforeTrades > 0 ? (tradesDelta / beforeTrades) * 100 : null,
      enteredRanking: Boolean(baseline && !before),
      ...detailStats(details[raw.id], item.price),
    };
  }).filter(Boolean).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const fresh = (file.fresh ?? []).map((raw) => {
    const item = cleanItem('kream', raw);
    return item && { ...item, rank: raw.rank, rankChange: raw.rankChange ?? 0, isNewRank: Boolean(raw.isNewRank), trades: raw.trades ?? null, ...detailStats(details[raw.id], item.price) };
  }).filter(Boolean);

  // 랭킹·뜨는 신상·상세 기록을 상품 하나로 합쳐 관심 급증과 프리미엄을 고른다.
  const byId = new Map();
  for (const [id, detail] of Object.entries(details)) {
    const item = cleanItem('kream', { id, url: `https://kream.co.kr/products/${id}`, name: detail.name, image: '' });
    if (item) byId.set(item.id, { ...item, ...detailStats(detail, null) });
  }
  for (const item of [...fresh, ...items]) byId.set(item.id, { ...byId.get(item.id), ...item });
  const all = [...byId.values()];

  // 크림 상품 페이지의 발매가로 계산한 웃돈. sibna 정가 대비 값보다 이 값을 믿는다.
  const verified = {};
  for (const [id, detail] of Object.entries(details)) {
    const price = byId.get(`kream:${id}`)?.price;
    const stats = detailStats(detail, Number.isFinite(price) ? price : null);
    if (Number.isFinite(stats.premiumPct)) {
      verified[id] = { releasePrice: stats.releasePrice, premiumPct: Math.round(stats.premiumPct * 10) / 10, releaseDate: stats.releaseDate };
    }
  }

  return {
    updatedAt: file.updatedAt,
    baselineAt: baseline?.at ?? null,
    freshAt: file.freshAt ?? null,
    verified,
    // 상품별 성별 인기·추천 사이즈(체결 거래 기준).
    fits: Object.fromEntries(Object.entries(details)
      .map(([id, d]) => [id, sizeAdvice(d.name, d.tradeLog)])
      .filter(([, fit]) => fit)),
    fresh,
    wishRisers: all
      .filter((item) => item.wishDelta > 0)
      .sort((a, b) => b.wishDelta - a.wishDelta)
      .slice(0, STALE_RISER_LIMIT),
    premium: all
      .filter((item) => item.premiumPct > 0)
      .sort((a, b) => b.premiumPct - a.premiumPct)
      .slice(0, STALE_RISER_LIMIT),
    ranking: items,
    tradeRisers: items
      .filter((item) => item.tradesDelta > 0)
      .sort((a, b) => b.tradesDelta - a.tradesDelta)
      .slice(0, STALE_RISER_LIMIT),
    rankRisers: items
      .filter((item) => item.rankChange > 0 || item.isNewRank || item.enteredRanking)
      .sort((a, b) => b.rankChange - a.rankChange || (a.rank ?? 999) - (b.rank ?? 999))
      .slice(0, STALE_RISER_LIMIT),
  };
}

export function buildMusinsaTrend(file) {
  if (!file?.items?.length) return null;
  const baseline = pickBaseline(file.history, file.updatedAt);
  const items = file.items.map((raw) => {
    const item = cleanItem('musinsa', raw);
    if (!item) return null;
    return {
      ...item,
      brand: String(raw.brand ?? ''),
      section: String(raw.section ?? ''),
      discount: Number.isFinite(raw.discount) ? raw.discount : null,
      isNew: Boolean(baseline && !baseline.items?.[raw.id]),
    };
  }).filter(Boolean);
  // 새로 등장한 상품을 앞에 두고, 나머지는 화면에 나온 순서를 유지한다.
  items.sort((a, b) => Number(b.isNew) - Number(a.isNew));
  return { updatedAt: file.updatedAt, baselineAt: baseline?.at ?? null, items };
}

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

/**
 * 휴대폰 알림 대상. 이미 설치된 앱이 읽는 deals 모양으로 만들어 앱을 다시 설치하지 않게 한다.
 * id 에 이유를 넣어 같은 상품이라도 이유마다 한 번만 울린다.
 */
export function kreamAlerts(trend, rules = {}) {
  if (!trend) return [];
  const { wishDelta = 300, rankRise = 10, premiumPct = 30, freshTop = 5 } = rules;
  const picks = new Map();
  const add = (item, reason, key) => {
    const id = `kream-alert:${item.id}:${key}`;
    if (!picks.has(id)) picks.set(id, { item, reason, id });
  };
  for (const item of trend.wishRisers) if (item.wishDelta >= wishDelta) add(item, `관심 +${fmt(item.wishDelta)}`, 'wish');
  for (const item of trend.ranking) if (item.rankChange >= rankRise) add(item, `순위 ▲${item.rankChange}`, 'rank');
  for (const item of trend.premium) {
    if (item.premiumPct >= premiumPct) add(item, `발매가 대비 +${item.premiumPct.toFixed(0)}%`, 'premium');
  }
  for (const item of trend.fresh.slice(0, freshTop)) add(item, `뜨는 신상 ${item.rank ?? ''}위`.trim(), 'fresh');

  return [...picks.values()].map(({ item, reason, id }) => ({
    id,
    kind: 'kream',
    name: `${reason} · ${item.name}`,
    store: 'KREAM',
    price: Number.isFinite(item.price) ? `${fmt(item.price)}원` : '',
    url: item.url,
    recommend: 0,
    watched: false,
    alert: true,
  }));
}

const SOURCE_LABELS = {
  kream: '크림 랭킹',
  kreamFresh: '크림 뜨는 신상',
  'sibna:sales': 'sibna 거래 활발',
  'sibna:premium': 'sibna 프리미엄',
  'sibna:under': 'sibna 정가 이하',
  'sibna:new': 'sibna 신규',
};
export const FREQUENT_WINDOWS = [1, 3, 7];
const FREQUENT_LIMIT = 30;
const kstDate = (iso) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);

function shiftDate(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 최근 1·3·7일 동안 크림 랭킹·뜨는 신상·sibna 네 목록에 자주 나온 상품.
 * 같은 날 같은 목록은 한 번만 센다. 점수 = (날짜, 목록) 등장 횟수.
 */
export function buildFrequent({ kreamFile, kreamTrend, sibna, now = new Date() }) {
  const hits = new Map();
  const mark = (id, date, source) => {
    const key = String(id);
    if (!hits.has(key)) hits.set(key, { pairs: new Set(), days: new Set(), sources: new Set() });
    const entry = hits.get(key);
    entry.pairs.add(`${date}|${source}`);
    entry.days.add(date);
    entry.sources.add(source);
  };
  for (const entry of kreamFile?.history ?? []) {
    const date = kstDate(entry.at);
    for (const id of Object.keys(entry.items ?? {})) mark(id, date, 'kream');
    for (const id of entry.fresh ?? []) mark(id, date, 'kreamFresh');
  }
  for (const day of sibna?.history ?? []) {
    for (const [list, ids] of Object.entries(day.lists ?? {})) for (const id of ids) mark(id, day.date, `sibna:${list}`);
  }
  if (!hits.size) return null;

  const kreamInfo = new Map();
  for (const item of [...(kreamTrend?.premium ?? []), ...(kreamTrend?.wishRisers ?? []), ...(kreamTrend?.fresh ?? []), ...(kreamTrend?.ranking ?? [])]) {
    kreamInfo.set(item.id.replace(/^kream:/, ''), item);
  }

  const today = kstDate(now.toISOString());
  const windows = {};
  for (const days of FREQUENT_WINDOWS) {
    const from = shiftDate(today, -(days - 1));
    const rows = [];
    for (const [id, entry] of hits) {
      const pairs = [...entry.pairs].filter((pair) => pair.slice(0, 10) >= from);
      if (!pairs.length) continue;
      const sources = [...new Set(pairs.map((pair) => pair.slice(11)))];
      const k = kreamInfo.get(id);
      const s = sibna?.products?.[id];
      const name = s?.name || k?.name;
      if (!name) continue;
      rows.push({
        id,
        name,
        url: `https://kream.co.kr/products/${id}`,
        image: safeUrl(s?.image) ?? k?.image ?? null,
        price: k?.price ?? s?.price ?? null,
        ...premiumOf(id, kreamTrend?.verified, s?.vsRetail),
        hits: pairs.length,
        days: new Set(pairs.map((pair) => pair.slice(0, 10))).size,
        sources: sources.map((source) => SOURCE_LABELS[source] ?? source),
      });
    }
    rows.sort((a, b) => b.hits - a.hits || b.days - a.days || b.sources.length - a.sources.length);
    windows[days] = rows.slice(0, FREQUENT_LIMIT);
  }
  return { updatedAt: now.toISOString(), windows };
}

/**
 * 웃돈(정가 대비 %). 크림 상품 페이지의 발매가로 계산한 값이 있으면 그것을 쓰고,
 * 없으면 sibna 값을 '확인 안 됨'으로 표시한다. sibna 정가가 틀린 상품이 있어서다.
 */
export function premiumOf(id, verified, sibnaValue) {
  const v = verified?.[id];
  if (v) return { premium: v.premiumPct, premiumSource: 'kream', releasePrice: v.releasePrice };
  return Number.isFinite(sibnaValue)
    ? { premium: sibnaValue, premiumSource: 'sibna', releasePrice: null }
    : { premium: null, premiumSource: null, releasePrice: null };
}

/** sibna 오늘의 랭킹 목록을 화면용으로 정리한다. */
export function buildSibnaRank(sibna, verified = {}) {
  if (!sibna?.lists) return null;
  const lists = {};
  for (const [key, items] of Object.entries(sibna.lists)) {
    lists[key] = items.map((item) => ({ ...item, ...premiumOf(item.id, verified, item.vsRetail), url: `https://kream.co.kr/products/${item.id}`, sibnaUrl: `https://sibna.kr/today/kream/${item.id}` }));
  }
  return { fetchedAt: sibna.fetchedAt, lists };
}

function readFile(dir, site) {
  const path = join(dir, `${site}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`[trend] ${site}.json 읽기 실패: ${error.message}`);
    return null;
  }
}

export function loadTrends(dir, { sibna = null, now = new Date() } = {}) {
  const kreamFile = readFile(dir, 'kream');
  const kream = buildKreamTrend(kreamFile);
  return {
    kream,
    musinsa: buildMusinsaTrend(readFile(dir, 'musinsa')),
    sibnaRank: buildSibnaRank(sibna, kream?.verified),
    frequent: buildFrequent({ kreamFile, kreamTrend: kream, sibna, now }),
  };
}
