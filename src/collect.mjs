import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesAny } from './lib/util.mjs';
import { isDealAlertable, isReleaseAlertable } from './notify/rules.mjs';
import { collectRuliweb } from './sources/ruliweb.mjs';
import { collectSibna } from './sources/sibna.mjs';
import { collectSibnaKream } from './sources/sibnaKream.mjs';
import { attachNaverRestock } from './sources/naverRestock.mjs';
import { kreamAlerts, loadTrends } from './trends.mjs';
import {
  attachRestock, attachStoreLinks, hotProducts, recommendBudget, recommendProducts, recommendReleases,
} from './sourcing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

function resolveSiteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return '';
  const [owner, name] = repo.split('/');
  return `https://${owner}.github.io/${name}/`;
}

/** 소스가 일시 실패해도 화면이 비지 않도록 직전 배포본을 받아둔다. */
async function loadPreviousFeed(siteUrl) {
  if (!siteUrl) return null;
  try {
    const res = await fetch(new URL('data/feed.json', siteUrl), { signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function runSource(id, name, task) {
  try {
    return { status: { id, name, ok: true }, data: await task() };
  } catch (error) {
    console.error(`[${id}] ${error.message}`);
    return { status: { id, name, ok: false, error: error.message }, data: null };
  }
}

function buildSite(feed) {
  rmSync(DIST, { recursive: true, force: true });
  cpSync(join(ROOT, 'site'), DIST, { recursive: true });
  mkdirSync(join(DIST, 'data'), { recursive: true });
  writeFileSync(join(DIST, 'data', 'feed.json'), JSON.stringify(feed));
}

async function main() {
  const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
  const siteUrl = resolveSiteUrl();
  const now = new Date();

  const previous = await loadPreviousFeed(siteUrl);
  const [ruliweb, sibna, sibnaKream] = await Promise.all([
    runSource('ruliweb', '루리웹 핫딜', () => collectRuliweb(now)),
    runSource('sibna', 'today 발매정보', () => collectSibna(config, now)),
    runSource('sibnaKream', 'today 크림 랭킹', () => collectSibnaKream(previous?.sibnaKream, now)),
  ]);

  if (!sibna.data && !ruliweb.data && !previous) {
    throw new Error('모든 소스 수집에 실패했고 직전 데이터도 없습니다.');
  }

  const watched = (item) => matchesAny(item.title, config.watchKeywords);
  const releases = sibna.data?.releases ?? previous?.releases ?? [];
  const deals = ruliweb.data ?? previous?.deals?.filter((item) => item.kind !== 'kream') ?? [];
  // 날짜별 기록을 이어 가려면 실패해도 직전 기록을 유지해야 한다.
  const sibnaKreamData = sibnaKream.data ?? previous?.sibnaKream ?? null;
  const trends = loadTrends(join(ROOT, 'trend'), { sibna: sibnaKreamData, now });
  const releasesOut = releases.map((item) => ({ ...item, watched: watched(item), alert: isReleaseAlertable(item, config, now) }));

  const hot = hotProducts(trends);
  const sourcing = {
    releases: recommendReleases(releasesOut, hot, now),
    products: attachRestock(recommendProducts(hot, now), releasesOut),
    budget: attachRestock(recommendBudget(hot, config.sourcing), releasesOut),
  };
  const storeLinks = await attachStoreLinks(sourcing.releases, { ...previous?.storeLinks });

  // 이미 발매된 추천 상품의 재입고 소식(네이버 블로그·카페). 키가 없으면 건너뛴다.
  // 윈도우 PowerShell로 넣은 비밀값은 앞에 BOM(﻿)이 붙어 있을 수 있어 떼어 낸다.
  const envKey = (name) => (process.env[name] ?? '').replace(/^﻿/, '').trim();
  const naverCreds = envKey('NAVER_SEARCH_ID') && envKey('NAVER_SEARCH_SECRET')
    ? { id: envKey('NAVER_SEARCH_ID'), secret: envKey('NAVER_SEARCH_SECRET') } : null;
  const restockTargets = [...new Map([...sourcing.products, ...sourcing.budget].map((item) => [item.id, item])).values()];
  const naver = naverCreds
    ? await runSource('naverRestock', '네이버 재입고 소식', () => attachNaverRestock(restockTargets, { ...previous?.restockNews }, naverCreds, { now }))
    : { status: { id: 'naverRestock', name: '네이버 재입고 소식', ok: false, error: '키 없음' }, data: null };
  // 실패하면 직전 결과라도 붙인다.
  const restockNews = naver.data ?? previous?.restockNews ?? {};
  if (!naver.data) for (const item of restockTargets) item.naverRestock = restockNews[item.id]?.posts ?? [];
  for (const items of [sourcing.products, sourcing.budget]) {
    for (const item of items) item.naverRestock = restockTargets.find((t) => t.id === item.id)?.naverRestock ?? [];
  }
  trends.sourcing = sourcing;

  buildSite({
    siteName: config.siteName,
    generatedAt: now.toISOString(),
    repo: process.env.GITHUB_REPOSITORY ?? '',
    sources: [ruliweb.status, sibna.status, sibnaKream.status, ...(naverCreds ? [naver.status] : [])],
    // alert 는 안드로이드 앱이 알림을 띄울지 판단하는 값이다.
    releases: releasesOut,
    // KREAM 소싱 알림은 앱이 이미 읽는 deals 에 실어 보내고, 사이트 핫딜 목록에서는 뺀다.
    deals: [
      ...deals.map((item) => ({ ...item, watched: watched(item), alert: isDealAlertable(item, config) })),
      ...kreamAlerts(trends.kream, config.kreamAlerts),
    ],
    news: sibna.data?.news ?? previous?.news ?? [],
    trends,
    // 다음 실행이 날짜별 기록을 이어 가도록 원본을 남긴다.
    sibnaKream: sibnaKreamData,
    // 발매 글에서 읽은 발매처 링크. 다음 실행 때 같은 글을 다시 요청하지 않게 남긴다.
    storeLinks,
    restockNews,
    shortcuts: config.shortcuts,
    alertPolicy: {
      quietStartHour: config.notify.quietHours.start,
      quietEndHour: config.notify.quietHours.end,
      morningDigest: config.notify.morningDigest,
      maxIndividualAlerts: config.notify.maxIndividualAlerts,
    },
  });

  console.log(`발매 ${releases.length} · 핫딜 ${deals.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
