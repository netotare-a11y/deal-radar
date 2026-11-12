importScripts('extractor.js', 'snapshot.js');

const REPO = 'netotare-a11y/deal-radar';
const API = `https://api.github.com/repos/${REPO}`;
const MIN_UPLOAD_GAP_MS = 10 * 60 * 1000;
const CYCLE_MINUTES = 120;
const RANKING_URL = 'https://kream.co.kr/?tab=home_ranking_v2#dealradar-auto';
const DETAIL_LIMIT = 20;
const PAGE_TIMEOUT_MS = 30000;
const PAGE_GAP_MS = 4000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function github(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok && res.status !== 404) {
    const error = new Error(res.status === 401 || res.status === 403
      ? 'GitHub 토큰이 만료됐거나 권한이 부족합니다.'
      : `GitHub 오류 ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res;
}

/** 팝업에 저장한 토큰이 우선이고, 없으면 설치 때 넣어 둔 token.local.json을 쓴다. */
async function getToken() {
  const { githubToken } = await chrome.storage.local.get('githubToken');
  if (githubToken) return githubToken;
  try {
    const res = await fetch(chrome.runtime.getURL('token.local.json'));
    return res.ok ? (await res.json()).token : null;
  } catch {
    return null;
  }
}

const decodeBase64 = (text) => new TextDecoder().decode(
  Uint8Array.from(atob(text.replace(/\s/g, '')), (c) => c.charCodeAt(0)),
);

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function putSnapshot(site, record, token) {
  const path = `/contents/trend/${site}.json`;
  const res = await github(`${path}?ref=main`, token);
  const current = res.status === 404 ? null : await res.json();
  const previous = current ? JSON.parse(decodeBase64(current.content)) : null;
  const next = globalThis.DealRadarSnapshot.mergeSnapshot(previous, site, record, new Date().toISOString());

  await github(path, token, {
    method: 'PUT',
    body: JSON.stringify({
      message: `data: ${site} 인기 기록`,
      branch: 'main',
      content: encodeBase64(JSON.stringify(next)),
      ...(current ? { sha: current.sha } : {}),
    }),
  });
  return next.items?.length ?? 0;
}

/** record 를 넘기면 그것을, 아니면 직접 연 화면의 마지막 기록을 올린다. 쌓인 상품 상세도 함께 올린다. */
async function upload(site, { force = false, record: given = null } = {}) {
  const keys = [`latest:${site}`, `upload:${site}`, 'pendingDetails'];
  const stored = await chrome.storage.local.get(keys);
  const last = stored[`upload:${site}`];
  const token = await getToken();
  const details = site === 'kream' ? Object.values(stored.pendingDetails ?? {}) : [];
  const record = given ?? (stored[`latest:${site}`] ? { ...stored[`latest:${site}`] } : { items: [] });
  record.details = details;

  if (!token) return { ok: false, error: 'GitHub 토큰이 없습니다.' };
  if (!record.items?.length && !details.length) return { ok: false, error: '기록이 없습니다. 페이지를 먼저 여세요.' };
  if (!force && last?.ok && Date.now() - Date.parse(last.at) < MIN_UPLOAD_GAP_MS) {
    return { ok: true, skipped: true };
  }

  const at = new Date().toISOString();
  let result;
  try {
    let count;
    try {
      count = await putSnapshot(site, record, token);
    } catch (error) {
      // 다른 기기나 탭이 먼저 저장한 경우 한 번만 다시 시도한다.
      if (error.status !== 409) throw error;
      count = await putSnapshot(site, record, token);
    }
    result = { ok: true, at, count, details: details.length };
    if (details.length) await chrome.storage.local.remove('pendingDetails');
  } catch (error) {
    result = { ok: false, at, error: error.message };
  }
  await chrome.storage.local.set({ [`upload:${site}`]: result });
  return result;
}

async function saveDetail(detail) {
  const { pendingDetails = {} } = await chrome.storage.local.get('pendingDetails');
  pendingDetails[detail.id] = { ...detail, at: new Date().toISOString() };
  await chrome.storage.local.set({ pendingDetails });
}

// 자동 수집 중 열어 둔 탭이 보내는 답을 기다린다.
const waiting = new Map();

async function openAndWait(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    return await new Promise((resolve) => {
      waiting.set(tab.id, resolve);
      setTimeout(() => resolve(null), PAGE_TIMEOUT_MS);
    });
  } finally {
    waiting.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/** 급상승·새로 진입·뜨는 신상 위주로 상세를 볼 상품을 고른다. */
function pickCandidates(main, fresh) {
  const { parseKreamLines } = globalThis.DealRadarExtractor;
  const ranked = main.map((card) => ({ id: card.id, ...parseKreamLines(card.lines) }));
  const risers = ranked
    .filter((item) => item.rankChange > 0 || item.isNewRank)
    .sort((a, b) => (b.isNewRank - a.isNewRank) || (b.rankChange - a.rankChange));
  const ids = [
    ...risers.slice(0, 8).map((item) => item.id),
    ...fresh.slice(0, 8).map((card) => card.id),
    ...ranked.slice(0, 10).map((item) => item.id),
  ];
  return [...new Set(ids)].slice(0, DETAIL_LIMIT);
}

const SITE_FEED = 'https://netotare-a11y.github.io/deal-radar/data/feed.json';
const VERIFY_LIMIT = 15;
const VERIFY_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * sibna 정가가 틀린 상품이 있어, sibna 상위·추천 상품의 크림 발매가를 하루 한 번 읽어 확인한다.
 * 사이트에 올라간 피드에서 상품 번호를 고른다.
 */
async function pickVerifyCandidates(already) {
  try {
    const feed = await (await fetch(`${SITE_FEED}?t=${Date.now()}`, { cache: 'no-store' })).json();
    const { detailAt = {} } = await chrome.storage.local.get('detailAt');
    const s = feed.trends?.sourcing ?? {};
    const lists = feed.trends?.sibnaRank?.lists ?? {};
    const ids = [
      ...(s.products ?? []), ...(s.budget ?? []),
      ...(lists.premium ?? []).slice(0, 10), ...(lists.sales ?? []).slice(0, 5),
    ].map((item) => String(item.id));
    return [...new Set(ids)]
      .filter((id) => /^\d+$/.test(id) && !already.includes(id))
      .filter((id) => !(Date.now() - (detailAt[id] ?? 0) < VERIFY_EVERY_MS))
      .slice(0, VERIFY_LIMIT);
  } catch {
    return [];
  }
}

async function runCycle() {
  const { cycle } = await chrome.storage.local.get('cycle');
  // 서비스 워커가 중간에 꺼진 경우를 대비해 20분 지난 실행 표시는 무시한다.
  if (cycle?.running && Date.now() - Date.parse(cycle.startedAt) < 20 * 60 * 1000) return cycle;

  const startedAt = new Date().toISOString();
  await chrome.storage.local.set({ cycle: { running: true, startedAt } });
  let result;
  try {
    const ranking = await openAndWait(RANKING_URL);
    if (!ranking?.main?.length) throw new Error('랭킹을 읽지 못했습니다. KREAM 화면이 바뀌었을 수 있습니다.');

    let detailCount = 0;
    const main = pickCandidates(ranking.main, ranking.fresh ?? []);
    const ids = [...main, ...(await pickVerifyCandidates(main))];
    const { detailAt = {} } = await chrome.storage.local.get('detailAt');
    for (const id of ids) {
      const detail = await openAndWait(`https://kream.co.kr/products/${id}#dealradar-auto`);
      if (detail) {
        await saveDetail(detail);
        detailAt[id] = Date.now();
        detailCount += 1;
      }
      await sleep(PAGE_GAP_MS);
    }
    await chrome.storage.local.set({ detailAt });

    const uploaded = await upload('kream', {
      force: true,
      record: { items: ranking.main, fresh: ranking.fresh ?? [] },
    });
    result = uploaded.ok
      ? { ok: true, at: new Date().toISOString(), ranking: ranking.main.length, fresh: ranking.fresh?.length ?? 0, details: detailCount }
      : { ok: false, at: new Date().toISOString(), error: uploaded.error };
  } catch (error) {
    result = { ok: false, at: new Date().toISOString(), error: error.message };
  }
  await chrome.storage.local.set({ cycle: { running: false, startedAt, last: result } });
  return result;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('cycle', { delayInMinutes: 1, periodInMinutes: CYCLE_MINUTES });
});
chrome.runtime.onStartup.addListener(async () => {
  if (!(await chrome.alarms.get('cycle'))) {
    chrome.alarms.create('cycle', { delayInMinutes: 1, periodInMinutes: CYCLE_MINUTES });
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cycle') runCycle();
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const tabId = sender.tab?.id;
  if (message?.type === 'autoRanking') {
    waiting.get(tabId)?.({ main: message.main, fresh: message.fresh });
    return false;
  }
  if (message?.type === 'detail') {
    if (message.auto) waiting.get(tabId)?.(message.detail);
    else if (message.detail) saveDetail(message.detail);
    return false;
  }
  if (message?.type === 'runCycle') {
    runCycle().then(respond);
    return true;
  }
  if (message?.type !== 'upload') return false;
  upload(message.site, { force: Boolean(message.force) }).then(respond);
  return true;
});
