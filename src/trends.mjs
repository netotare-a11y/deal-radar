import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeUrl } from './lib/util.mjs';

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

  return {
    updatedAt: file.updatedAt,
    baselineAt: baseline?.at ?? null,
    freshAt: file.freshAt ?? null,
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

export function loadTrends(dir) {
  return {
    kream: buildKreamTrend(readFile(dir, 'kream')),
    musinsa: buildMusinsaTrend(readFile(dir, 'musinsa')),
  };
}
