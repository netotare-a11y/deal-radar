import { firstImage, parseRss, toIso } from '../lib/rss.mjs';
import { addDays, decodeEntities, fetchText, kst, matchesAny, safeUrl, sleep, stripTags } from '../lib/util.mjs';

const BASE = 'https://sibna.kr/today';

export function parseReleaseItem(item) {
  const id = item.guid.match(/(\d+)$/)?.[1];
  const meta = stripTags(item.description);
  const date = meta.match(/발매일\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!id || !date) return null;

  return {
    id: `sibna:${id}`,
    title: decodeEntities(item.title).trim(),
    url: safeUrl(item.link),
    image: safeUrl(item.enclosure || firstImage(item.description)),
    date,
    time: meta.match(/발매시간\s*(\d{2}:\d{2})/)?.[1] ?? '',
    method: (meta.match(/진행방식\s*([^\s·]+)/)?.[1] ?? '').replace(/[.,]+$/, ''),
    category: item.category,
    postedAt: toIso(item.pubDate),
  };
}

export function parseNews(html) {
  const news = [];
  const lead = html.match(/<a class="tdh-news-lead" href="([^"]+)"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong>([\s\S]*?)<\/strong>(?:\s*<p>([\s\S]*?)<\/p>)?/);
  if (lead) {
    news.push({
      url: safeUrl(decodeEntities(lead[1])),
      section: stripTags(lead[2]).split('·')[0].trim(),
      title: stripTags(lead[3]),
      summary: stripTags(lead[4] ?? ''),
    });
  }
  const list = html.match(/<ul class="tdh-news-list">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  for (const [, url, section, title] of list.matchAll(/<a href="([^"]+)"[^>]*>\s*<span>([\s\S]*?)<\/span>([\s\S]*?)<\/a>/g)) {
    news.push({ url: safeUrl(decodeEntities(url)), section: stripTags(section), title: stripTags(title), summary: '' });
  }
  return news.filter((item) => item.url && item.title);
}

export async function collectSibna(config, now = new Date()) {
  const today = kst(now).date;
  const { daysAhead, excludeCategories, excludeKeywords } = config.releases;
  const urls = [`${BASE}/rss.php`];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    urls.push(`${BASE}/rss.php?date=${addDays(today, offset)}`);
  }

  // 작은 사이트라 동시 요청 대신 순차로, 간격을 두고 가져온다.
  const byId = new Map();
  for (const url of urls) {
    const items = parseRss(await fetchText(url)).map(parseReleaseItem).filter(Boolean);
    for (const item of items) {
      const prev = byId.get(item.id);
      byId.set(item.id, prev ? { ...prev, ...item, image: item.image ?? prev.image } : item);
    }
    await sleep(400);
  }

  const releases = [...byId.values()]
    .filter((item) => item.url && item.date >= today)
    .filter((item) => !excludeCategories.includes(item.category))
    .filter((item) => !matchesAny(item.title, excludeKeywords))
    .sort((a, b) => `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`));

  const news = parseNews(await fetchText(`${BASE}/`));
  return { releases, news };
}
