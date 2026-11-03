import { firstImage, parseRss, toIso } from '../lib/rss.mjs';
import { decodeEntities, fetchText, kst, safeUrl, stripTags } from '../lib/util.mjs';

const BOARD_URL = 'https://bbs.ruliweb.com/market/board/1020';
const RSS_URL = `${BOARD_URL}/rss`;

/** 제목에서 판매처와 대표 가격을 뽑는다. 예) "[지마켓] 상품 (69,800/3,000)" */
export function parseDealTitle(title) {
  const store = title.match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() ?? '';
  const name = title.replace(/^\s*\[[^\]]+\]\s*/, '').trim();
  const dollar = name.match(/\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:달러|불)/);
  const won = name.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원?/);
  let price = '';
  if (dollar) price = `$${dollar[1] ?? dollar[2]}`;
  else if (won) price = `${Number(won[1].replaceAll(',', '')).toLocaleString('en-US')}원`;
  return { store, name, price };
}

function cell(row, className) {
  const match = row.match(new RegExp(`<td class="${className}[^"]*"[^>]*>([\\s\\S]*?)</td>`));
  return match ? stripTags(match[1]) : '';
}

const toNumber = (text) => Number(String(text).replace(/[^\d]/g, '')) || 0;

function listTimeToIso(text, now) {
  const clock = text.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    return new Date(`${kst(now).date}T${clock[1].padStart(2, '0')}:${clock[2]}:00+09:00`).toISOString();
  }
  const date = text.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  return date ? new Date(`${date[1]}-${date[2]}-${date[3]}T00:00:00+09:00`).toISOString() : null;
}

/** 게시판 목록 HTML — RSS 에 없는 추천수·조회수·댓글수·BEST 여부를 얻는다. 공지는 제외. */
export function parseBoardList(html, now = new Date()) {
  const rows = html.split(/<tr class="table_body/).slice(1).map((part) => {
    const end = part.indexOf('</tr>');
    return end === -1 ? part : part.slice(0, end);
  });

  const deals = new Map();
  for (const row of rows) {
    const classes = row.slice(0, row.indexOf('"'));
    if (/\bnotice\b/.test(classes)) continue;

    const id = row.match(/\/market\/board\/1020\/read\/(\d+)/)?.[1];
    if (!id) continue;

    const subject = row.match(/class="subject_link[^"]*"[^>]*>([\s\S]*?)(?:<a class="num_reply"|<\/td>)/);
    const title = subject ? stripTags(subject[1]) : '';
    if (!title) continue;

    const category = cell(row, 'divsn');
    const isBest = /\bbest\b/.test(classes);
    const next = {
      id,
      title,
      category: category === 'BEST' ? '' : category,
      best: isBest,
      recommend: toNumber(cell(row, 'recomd')),
      hits: toNumber(cell(row, 'hit')),
      replies: toNumber(row.match(/class="num_reply"[^>]*>\s*\((\d+)\)/)?.[1] ?? 0),
      postedAt: listTimeToIso(cell(row, 'time'), now),
    };

    // 같은 글이 BEST 영역과 일반 목록에 함께 나오면 두 정보를 합친다.
    const prev = deals.get(id);
    deals.set(id, prev
      ? { ...prev, ...next, best: prev.best || next.best, category: prev.category || next.category }
      : next);
  }
  return [...deals.values()];
}

export function mergeDeals(rssItems, listItems) {
  const byId = new Map();
  for (const item of listItems) {
    byId.set(item.id, { ...item });
  }
  for (const item of rssItems) {
    const id = item.link.match(/\/read\/(\d+)/)?.[1];
    if (!id) continue;
    const prev = byId.get(id);
    byId.set(id, {
      id,
      title: decodeEntities(item.title),
      best: prev?.best ?? false,
      recommend: prev?.recommend ?? 0,
      hits: prev?.hits ?? 0,
      replies: prev?.replies ?? 0,
      category: item.category || prev?.category || '',
      postedAt: toIso(item.pubDate) ?? prev?.postedAt ?? null,
      image: safeUrl(firstImage(item.description)),
    });
  }

  return [...byId.values()]
    .map((deal) => ({
      ...parseDealTitle(deal.title),
      id: `ruliweb:${deal.id}`,
      title: deal.title,
      url: `${BOARD_URL}/read/${deal.id}`,
      image: deal.image ?? null,
      category: deal.category,
      best: deal.best,
      recommend: deal.recommend,
      hits: deal.hits,
      replies: deal.replies,
      postedAt: deal.postedAt,
    }))
    .sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));
}

export async function collectRuliweb(now = new Date()) {
  const [rss, html] = await Promise.all([fetchText(RSS_URL), fetchText(BOARD_URL)]);
  return mergeDeals(parseRss(rss), parseBoardList(html, now));
}
