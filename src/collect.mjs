import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesAny } from './lib/util.mjs';
import { isDealAlertable, isReleaseAlertable } from './notify/rules.mjs';
import { collectRuliweb } from './sources/ruliweb.mjs';
import { collectSibna } from './sources/sibna.mjs';
import { kreamAlerts, loadTrends } from './trends.mjs';

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
  const [ruliweb, sibna] = await Promise.all([
    runSource('ruliweb', '루리웹 핫딜', () => collectRuliweb(now)),
    runSource('sibna', 'today 발매정보', () => collectSibna(config, now)),
  ]);

  if (!sibna.data && !ruliweb.data && !previous) {
    throw new Error('모든 소스 수집에 실패했고 직전 데이터도 없습니다.');
  }

  const watched = (item) => matchesAny(item.title, config.watchKeywords);
  const releases = sibna.data?.releases ?? previous?.releases ?? [];
  const deals = ruliweb.data ?? previous?.deals?.filter((item) => item.kind !== 'kream') ?? [];
  const trends = loadTrends(join(ROOT, 'trend'));

  buildSite({
    siteName: config.siteName,
    generatedAt: now.toISOString(),
    repo: process.env.GITHUB_REPOSITORY ?? '',
    sources: [ruliweb.status, sibna.status],
    // alert 는 안드로이드 앱이 알림을 띄울지 판단하는 값이다.
    releases: releases.map((item) => ({ ...item, watched: watched(item), alert: isReleaseAlertable(item, config, now) })),
    // KREAM 소싱 알림은 앱이 이미 읽는 deals 에 실어 보내고, 사이트 핫딜 목록에서는 뺀다.
    deals: [
      ...deals.map((item) => ({ ...item, watched: watched(item), alert: isDealAlertable(item, config) })),
      ...kreamAlerts(trends.kream, config.kreamAlerts),
    ],
    news: sibna.data?.news ?? previous?.news ?? [],
    trends,
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
