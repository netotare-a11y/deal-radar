const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const USER_AGENT = 'deal-radar/0.1 (personal feed reader)';

/** 서버 시간대와 무관하게 KST 날짜·시각을 돌려준다. GitHub Actions 는 UTC 로 돈다. */
export function kst(date = new Date()) {
  const iso = new Date(date.getTime() + KST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), hour: Number(iso.slice(11, 13)) };
}

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1].toLowerCase() === 'x';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** 수집 데이터는 외부 입력이므로 https 링크만 통과시킨다. */
export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchText(url, { retries = 1, timeoutMs = 20000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(1500);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,text/xml,*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${url} 수집 실패: ${lastError.message}`);
}

export function matchesAny(text, keywords = []) {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}
