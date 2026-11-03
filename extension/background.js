importScripts('extractor.js', 'snapshot.js');

const REPO = 'netotare-a11y/deal-radar';
const API = `https://api.github.com/repos/${REPO}`;
const MIN_UPLOAD_GAP_MS = 10 * 60 * 1000;

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
  return next.items.length;
}

async function upload(site, { force = false } = {}) {
  const keys = [`latest:${site}`, `upload:${site}`, 'githubToken'];
  const stored = await chrome.storage.local.get(keys);
  const record = stored[`latest:${site}`];
  const last = stored[`upload:${site}`];
  const token = stored.githubToken;

  if (!token) return { ok: false, error: 'GitHub 토큰을 먼저 등록하세요.' };
  if (!record) return { ok: false, error: '기록이 없습니다. 페이지를 먼저 여세요.' };
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
    result = { ok: true, at, count };
  } catch (error) {
    result = { ok: false, at, error: error.message };
  }
  await chrome.storage.local.set({ [`upload:${site}`]: result });
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'upload') return false;
  upload(message.site, { force: Boolean(message.force) }).then(respond);
  return true;
});
