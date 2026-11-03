import { decodeEntities } from './util.mjs';

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';
  const raw = match[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return cdata ? cdata[1].trim() : decodeEntities(raw);
}

export function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, block]) => ({
    title: readTag(block, 'title'),
    link: readTag(block, 'link'),
    guid: readTag(block, 'guid'),
    description: readTag(block, 'description'),
    category: readTag(block, 'category'),
    pubDate: readTag(block, 'pubDate'),
    enclosure: block.match(/<enclosure[^>]*\surl="([^"]+)"/)?.[1] ?? '',
  }));
}

export function firstImage(html) {
  return html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? '';
}

export function toIso(pubDate) {
  const time = Date.parse(pubDate);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
