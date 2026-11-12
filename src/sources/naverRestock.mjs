import { brandNames, brandOf, searchQuery } from '../sourcing.mjs';
import { decodeEntities, sleep, stripTags } from '../lib/util.mjs';

// NAVER API HUB 검색(블로그·카페). 문서: https://api.ncloud-docs.com/docs/naver-api-hub-search-blog
const HUB = 'https://naverapihub.apigw.ntruss.com/search/v1';
const KINDS = ['blog', 'cafearticle'];
const REFRESH_MS = 6 * 60 * 60 * 1000;
const MAX_NEW_PER_RUN = 10;
const KEEP_DAYS = 30;
const PER_ITEM = 3;

// '재판매'는 되팔기 가격 글에도 쓰여 넣지 않는다.
export const RESTOCK_WORD = /재입고|리스탁|restock|입고\s*예정|재발매|추가\s*입고|매장\s*입고/i;
// 중고 거래·양도 글은 재입고 소식이 아니다.
const MARKET = /삽니다|팝니다|판매합니다|양도|중고|교환|구해요|구합니다|사요/;
const COLOR = new Set(['black', 'white', 'grey', 'gray', 'navy', 'blue', 'red', 'green', 'brown', 'beige', 'ivory', 'cream', 'pink',
  '블랙', '화이트', '그레이', '네이비', '블루', '레드', '그린', '브라운', '베이지', '아이보리', '크림', '핑크', '-', 'asia', 'kr', 'sizing', 'ver.', '(korean',
  'orange', 'sail', 'midnight', 'purple', 'yellow', 'silver', 'gold', 'khaki', 'olive', 'charcoal', 'multicolor', 'light', 'dark',
  '오렌지', '세일', '미드나잇', '퍼플', '옐로우', '실버', '골드', '카키', '올리브', '차콜', '멀티컬러', '라이트', '다크', '(w)']);

const words = (text) => String(text ?? '').toLowerCase().replace(/[()[\]{}·,/&'"!?:+]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);

// 크림 영문 상품명의 옷 종류 낱말을 네이버 글에서 쓰는 한글로 바꾼다. 첫 번째가 검색어로 쓰인다.
const KO = {
  fleece: ['플리스', '후리스'], fur: ['퍼'], zip: ['집업'], hoodie: ['후드', '후디'], hooded: ['후드'],
  jacket: ['자켓', '재킷'], down: ['다운'], padding: ['패딩'], parka: ['파카'], pants: ['팬츠', '바지'], cap: ['캡', '모자'],
  beanie: ['비니'], sweatshirt: ['맨투맨', '스웻셔츠'], cardigan: ['가디건'], knit: ['니트'], 'thin-light': ['씬라이트', '경량'],
  basic: ['베이직'], wallet: ['지갑'], bag: ['가방', '백'], headphones: ['헤드폰'], headphone: ['헤드폰'], tee: ['티셔츠'],
  't-shirt': ['티셔츠'], top: ['탑'], shirt: ['셔츠'], vest: ['베스트', '조끼'], boots: ['부츠'], slipper: ['슬리퍼'],
};
// 흔한 옷 종류 낱말만 겹쳐서는 같은 상품으로 보지 않는다.
const GENERIC = new Set(['후드', '후디', '자켓', '재킷', '팬츠', '바지', '캡', '모자', '셔츠', '티셔츠', '탑', '가방', '백', '베이직', '집업', '패딩', '다운', '로고', '오버셔츠', '맨투맨',
  'hoodie', 'jacket', 'pants', 'cap', 'shirt', 'top', 'bag', 'basic', 'zip', 'up', 'logo', 'padding', 'down', 'wide', '2e',
  'dri-fit', 'running', 'low', 'high', 'mid', '국내', '정식', '발매', '제품', 'x']);

/** 모델 낱말마다 [영문, 한글…] 후보를 둔다. */
export function restockQuery(name) {
  const brand = brandOf(name);
  const brandSet = new Set(brand ? brandNames(brand).flatMap(words) : []);
  const model = words(searchQuery(name))
    .filter((w) => !brandSet.has(w) && !COLOR.has(w))
    .slice(0, 5)
    .map((w) => [w, ...(KO[w] ?? [])]);
  const head = brand ? brandNames(brand)[0] : '';
  const queryWords = model.slice(0, 4).map((variants) => variants[1] ?? variants[0]);
  return { query: `${head} ${queryWords.join(' ')} 재입고`.trim(), brand, model };
}

/**
 * 제목에 재입고 말이 있고, 브랜드가 있고, 모델 낱말이 겹치는 글만 남긴다.
 * 본문 요약까지 보면 광고 글이 너무 많이 걸려 제목만 본다.
 * 흔하지 않은 낱말(모델명 등)이 2개 이상이면 2개가 겹쳐야 한다.
 */
export function relevant(post, { brand, model }) {
  const title = post.title.toLowerCase();
  if (!RESTOCK_WORD.test(post.title) || MARKET.test(post.title)) return false;
  if (brand && !brandNames(brand).some((n) => title.includes(n.toLowerCase()))) return false;
  const hit = (variants) => variants.some((v) => title.includes(v));
  const distinctive = model.filter((variants) => !variants.some((v) => GENERIC.has(v)));
  const pool = distinctive.length ? distinctive : model;
  if (!pool.length) return Boolean(brand);
  return pool.filter(hit).length >= Math.min(2, pool.length);
}

function toPost(item, kind) {
  const m = String(item.postdate ?? '').match(/^(\d{4})(\d{2})(\d{2})$/);
  return {
    title: stripTags(decodeEntities(item.title ?? '')),
    summary: stripTags(decodeEntities(item.description ?? '')).slice(0, 120),
    url: String(item.link ?? ''),
    date: m ? `${m[1]}-${m[2]}-${m[3]}` : null,
    source: kind === 'blog' ? '블로그' : '카페',
  };
}

async function search(kind, query, creds, fetchImpl) {
  const params = new URLSearchParams({ query, display: '20', sort: 'date', format: 'json' });
  const res = await fetchImpl(`${HUB}/${kind}?${params}`, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': creds.id, 'X-NCP-APIGW-API-KEY': creds.secret },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('네이버 검색 키가 거절됐습니다.'), { fatal: true });
  if (!res.ok) throw new Error(`네이버 ${kind} 검색 실패 (${res.status})`);
  return ((await res.json()).items ?? []).map((item) => toPost(item, kind));
}

export async function findNaverRestock(name, creds, { fetchImpl = fetch, now = new Date() } = {}) {
  const q = restockQuery(name);
  const since = new Date(now.getTime() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const posts = [];
  for (const kind of KINDS) {
    posts.push(...(await search(kind, q.query, creds, fetchImpl)));
    await sleep(150);
  }
  return posts
    .filter((p) => /^https:\/\//.test(p.url) && relevant(p, q))
    .filter((p) => !p.date || p.date >= since)
    .filter((p, i, all) => all.findIndex((o) => o.title === p.title) === i)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, PER_ITEM);
}

/**
 * 추천 상품마다 네이버 블로그·카페에서 재입고 소식을 찾아 붙인다.
 * 6시간 안에 찾아 본 상품은 다시 묻지 않고, 한 번에 새로 묻는 상품은 10개까지다.
 */
export async function attachNaverRestock(items, cache = {}, creds, { fetchImpl = fetch, now = new Date() } = {}) {
  const next = {};
  let asked = 0;
  for (const item of items) {
    let hit = cache[item.id];
    const stale = !hit || now - Date.parse(hit.at) > REFRESH_MS;
    if (stale && creds && asked < MAX_NEW_PER_RUN) {
      asked += 1;
      try {
        hit = { at: now.toISOString(), posts: await findNaverRestock(item.name, creds, { fetchImpl, now }) };
      } catch (error) {
        if (error.fatal) throw error;
        console.error(`[naver] ${item.name}: ${error.message}`);
      }
    }
    if (hit) {
      next[item.id] = hit;
      item.naverRestock = hit.posts;
    }
  }
  return next;
}
