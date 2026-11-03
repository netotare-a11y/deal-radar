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

export function buildKreamTrend(file) {
  if (!file?.items?.length) return null;
  const baseline = pickBaseline(file.history, file.updatedAt);

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
    };
  }).filter(Boolean).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return {
    updatedAt: file.updatedAt,
    baselineAt: baseline?.at ?? null,
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
