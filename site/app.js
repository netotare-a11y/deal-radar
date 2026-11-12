const REFRESH_MS = 5 * 60 * 1000;
const NEW_WINDOW_MS = 3 * 60 * 60 * 1000;
const STALE_MS = 2 * 60 * 60 * 1000;
const PAGE = 10;
const TABS = ['today', 'trends', 'releases', 'deals', 'more'];
const ALIASES = { news: 'more', links: 'more' };

const view = document.getElementById('view');
const updated = document.getElementById('updated');
const alertBox = document.getElementById('alert');

let feed = null;
const state = {
  releaseQuery: '', releaseMethod: '전체', dealQuery: '', dealCategory: '전체',
  src: '추천', rec: '발매 예정', freq: '7일', kream: '순위 급상승', sibna: '거래 활발',
  open: new Set(), // '더 보기'로 펼친 목록
};

// 피드 내용은 외부 사이트에서 온 값이다. 화면에 넣을 때 항상 이스케이프한다.
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
// KREAM 소싱 알림은 앱 알림용으로 deals 에 섞여 오므로 핫딜 목록에서는 뺀다.
const hotDeals = () => feed.deals.filter((item) => item.kind !== 'kream');
const won = (n) => (Number.isFinite(n) ? `${n.toLocaleString('ko-KR')}원` : '');
const pct = (n, digits = 0) => (Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(digits)}%` : '');
const tone = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'mute');
/** 크림 발매가로 확인한 웃돈은 빨강·파랑, sibna 정가 기준(확인 전)은 회색으로 보여 준다. */
function premTag(item, digits = 0) {
  if (!Number.isFinite(item.premium)) return '';
  return item.premiumSource === 'sibna'
    ? `<div class="sig mute" title="sibna 정가 기준. 크림 발매가로 아직 확인하지 못했습니다.">sibna ${esc(pct(item.premium, digits))}</div>`
    : `<div class="sig ${tone(item.premium)}" title="크림 발매가 기준">발매가 ${esc(pct(item.premium, digits))}</div>`;
}
const md = (ymd) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

function kstNow() {
  const iso = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(ymd) {
  const diff = Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${kstNow().date}T00:00:00Z`)) / 86400000);
  const d = new Date(`${ymd}T00:00:00Z`);
  const base = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEKDAYS[d.getUTCDay()]}`;
  return diff === 0 ? `오늘 · ${base}` : diff === 1 ? `내일 · ${base}` : base;
}

function relativeTime(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}

const isNew = (item) => item.postedAt && Date.now() - Date.parse(item.postedAt) < NEW_WINDOW_MS;
const isPast = (item, now) => item.date === now.date && item.time && item.time < now.time;

const thumb = (url) => (url
  ? `<img class="thumb" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-thumb>`
  : '<div class="thumb"></div>');

const ext = (url, label, cls = 'btn') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

// ── 공통 조각 ─────────────────────────────

function block(title, body, { count = '', aside = '' } = {}) {
  return `<section class="block">
    <div class="block-head"><h2>${esc(title)}</h2>${count !== '' ? `<span class="count">${esc(count)}</span>` : ''}${aside ? `<span class="aside">${aside}</span>` : ''}</div>
    ${body}
  </section>`;
}

/** 처음 10개만 보이고 '더 보기'로 펼친다. */
function rows(items, render, { key, empty, limit = PAGE } = {}) {
  if (!items.length) return `<div class="rows"><p class="empty">${esc(empty)}</p></div>`;
  const all = !key || state.open.has(key);
  const shown = all ? items : items.slice(0, limit);
  const more = !all && items.length > limit
    ? `<button class="more" type="button" data-more="${esc(key)}">더 보기 (${items.length - limit}개 더)</button>` : '';
  return `<div class="rows">${shown.map(render).join('')}</div>${more}`;
}

function seg(values, selected, name, cls = 'seg') {
  return `<div class="${cls}" role="group">${values.map((value) => (
    `<button type="button" data-set="${name}" data-value="${esc(value)}" aria-pressed="${value === selected}">${esc(value)}</button>`
  )).join('')}</div>`;
}

const searchBox = (name, value, placeholder) => (
  `<input class="search" type="search" data-search="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">`
);

function linkGroup(label, links) {
  if (!links?.length) return '';
  return `<div class="links"><span class="lab">${esc(label)}</span>${links.map((l) => ext(l.url, `${l.label} ↗`, l.primary ? 'btn primary' : 'btn')).join('')}</div>`;
}

/** 크림 상품 하나로 바로 갈 수 있는 기본 버튼 묶음(서버가 따로 주지 않은 목록용). */
function productLinks(id, name) {
  const q = encodeURIComponent(name);
  return [
    { label: '크림', url: `https://kream.co.kr/products/${id}`, primary: true },
    { label: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${q}` },
    { label: '무신사', url: `https://www.musinsa.com/search/goods?keyword=${q}` },
    { label: '번개장터', url: `https://m.bunjang.co.kr/search/products?q=${q}` },
  ];
}

/** 줄을 누르면 이유와 버튼이 펼쳐지는 항목. */
function expandable({ num = '', image, name, sub = '', right = '', drawer }) {
  return `<details>
    <summary class="item"><span class="num">${esc(num)}</span>${thumb(image)}
      <span class="main"><span class="name">${esc(name)}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</span>
      <span class="right">${right}</span>
    </summary>
    <div class="drawer">${drawer}</div>
  </details>`;
}

const why = (reasons) => (reasons?.length ? `<p class="why">${reasons.map((r) => `<span>${esc(r)}</span>`).join('')}</p>` : '');

// ── 행 종류 ─────────────────────────────

function releaseRow(item, now, { showDate = false } = {}) {
  const marks = [
    item.method ? `<span class="${item.method === '응모' ? 'up' : ''}">${esc(item.method)}</span>` : '',
    item.watched ? '<b>관심</b>' : '',
  ].filter(Boolean).join(' · ');
  const when = showDate ? md(item.date) : (item.time || '미정');
  return `<a class="item ${isPast(item, now) ? 'past' : ''}" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    <span class="num time">${esc(when)}</span>${thumb(item.image)}
    <span class="main"><span class="name">${esc(item.title)}</span><span class="sub">${showDate && item.time ? `${esc(item.time)} · ` : ''}${marks}</span></span>
    <span class="right">${isNew(item) ? '<span class="mark">NEW</span>' : ''}</span>
  </a>`;
}

function dealRow(item) {
  const stats = [item.store, item.recommend ? `추천 ${item.recommend}` : '', item.replies ? `댓글 ${item.replies}` : '', item.postedAt ? relativeTime(item.postedAt) : '']
    .filter(Boolean).map(esc).join(' · ');
  return `<a class="item no-num" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    ${thumb(item.image)}
    <span class="main"><span class="name">${esc(item.name)}</span><span class="sub">${item.best ? '<b class="up">BEST</b> · ' : ''}${item.watched ? '<b>관심</b> · ' : ''}${stats}</span></span>
    <span class="right"><span class="price">${esc(item.price ?? '')}</span></span>
  </a>`;
}

/** 소싱 추천(발매 예정·신상품·저단가) 한 줄. */
function recRow(item, index) {
  const isRelease = Boolean(item.date);
  const right = isRelease
    ? `<div class="price">${esc(md(item.date))} ${esc(item.time)}</div><div class="sig ${item.method === '응모' ? 'up' : 'mute'}">${esc(item.method)}</div>`
    : `<div class="price">${esc(won(item.price))}</div>${premTag(item)}`;
  const stores = (item.storeLinks ?? []).map((l) => ({ label: `발매처 ${l.label}`, url: l.url, primary: true }));
  const buy = [...stores, ...(item.postUrl ? [{ label: '발매 정보', url: item.postUrl }] : []), ...item.links];
  const restock = item.restock
    ? `<p class="note"><b class="up">재입고·재발매 소식</b> ${esc(md(item.restock.date))} ${esc(item.restock.time)} · ${ext(item.restock.url, item.restock.title, '')}</p>` : '';
  const similar = item.similar
    ? `<p class="note">비슷한 크림 상품: ${ext(item.similar.url, item.similar.name, '')}${Number.isFinite(item.similar.premium) ? ` <b class="${item.similar.premiumSource === 'sibna' ? 'mute' : tone(item.similar.premium)}">${item.similar.premiumSource === 'sibna' ? 'sibna' : '발매가'} ${esc(pct(item.similar.premium))}</b>` : ''}</p>` : '';
  const posts = item.naverRestock ?? [];
  const naver = posts.length
    ? `<div class="news-list"><span class="lab">재입고 소식</span>${posts.map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"><span class="mute">${esc(p.date ? md(p.date) : '날짜?')} ${esc(p.source)}</span> ${esc(p.title)}</a>`).join('')}</div>`
    : '';
  const released = item.releaseDate && item.releaseDate < kstNow().date;
  return expandable({
    num: index + 1,
    image: item.image,
    name: item.name,
    sub: `${item.restock || posts.length ? '<b class="up">재입고 소식</b> · ' : ''}${esc(item.reasons[0] ?? '')}`,
    right,
    drawer: `${why(item.reasons)}${similar}${restock}${naver}
      ${linkGroup(isRelease ? '사러 가기' : '크림·검색', buy)}
      ${linkGroup(released ? '발매 지남·구할 곳' : '구할 곳', item.where)}`,
  });
}

function kreamRow(item) {
  const signal = item.wishDelta > 0 ? `<div class="sig up">관심 +${item.wishDelta.toLocaleString('ko-KR')}</div>`
    : item.isNewRank || item.enteredRanking ? '<div class="sig up">신규</div>'
      : item.rankChange ? `<div class="sig ${tone(item.rankChange)}">${item.rankChange > 0 ? '▲' : '▼'}${Math.abs(item.rankChange)}</div>`
        : Number.isFinite(item.premiumPct) ? `<div class="sig ${tone(item.premiumPct)}">발매가 ${esc(pct(item.premiumPct))}</div>` : '';
  const facts = [
    Number.isFinite(item.wish) ? `관심 ${item.wish.toLocaleString('ko-KR')}${item.wishDelta > 0 ? ` (+${item.wishDelta.toLocaleString('ko-KR')})` : ''}` : '',
    Number.isFinite(item.premiumPct) ? `발매가 ${won(item.releasePrice)} 대비 ${pct(item.premiumPct)}` : '',
    Number.isFinite(item.trades) ? `거래 ${item.trades.toLocaleString('ko-KR')}${item.tradesDelta > 0 ? ` (+${item.tradesDelta.toLocaleString('ko-KR')})` : ''}` : '',
    item.releaseDate ? `발매 ${item.releaseDate.slice(2).replaceAll('-', '.')}` : '',
    item.badge ?? '',
  ].filter(Boolean);
  const id = item.id.replace(/^kream:/, '');
  return expandable({
    num: item.rank ?? '',
    image: item.image,
    name: item.name,
    sub: esc(facts.slice(0, 2).join(' · ')),
    right: `<div class="price">${esc(won(item.price))}</div>${signal}`,
    drawer: `${why(facts)}${linkGroup('바로가기', productLinks(id, item.name))}`,
  });
}

function frequentRow(item, index) {
  return expandable({
    num: index + 1,
    image: item.image,
    name: item.name,
    sub: `<b>${item.days}일 · ${item.hits}회</b> · ${esc(item.sources.join(', '))}`,
    right: `<div class="price">${esc(won(item.price))}</div>${premTag(item, 1)}`,
    drawer: `${why(item.sources)}${linkGroup('바로가기', productLinks(item.id, item.name))}`,
  });
}

function sibnaRow(item) {
  return expandable({
    num: item.rank,
    image: item.image,
    name: item.name,
    sub: esc([item.brand, item.activity ? `활발도 ${item.activity}` : ''].filter(Boolean).join(' · ')),
    right: `<div class="price">${esc(won(item.price))}</div>${premTag(item, 1)}`,
    drawer: `<p class="why">${item.premiumSource === 'kream'
      ? `<span>크림 발매가 ${esc(won(item.releasePrice))} 기준 ${esc(pct(item.premium, 1))}</span><span>sibna 표시 ${esc(pct(item.vsRetail, 1))}</span>`
      : '<span>sibna 정가 기준 값입니다. 정가가 틀린 상품이 있어 크림 발매가로 확인 중입니다.</span>'}</p>`
      + linkGroup('바로가기', [...productLinks(item.id, item.name), { label: 'sibna 분석', url: item.sibnaUrl }]),
  });
}

// ── 오늘 ─────────────────────────────

function renderToday() {
  const now = kstNow();
  const today = feed.releases.filter((item) => item.date === now.date);
  const remaining = today.filter((item) => !isPast(item, now));
  const past = today.filter((item) => isPast(item, now));
  const next = remaining.find((item) => item.time);
  const later = feed.releases.filter((item) => item.date > now.date);
  const sourcing = feed.trends?.sourcing ?? {};
  const hot = hotDeals().filter((d) => d.best || d.recommend > 0)
    .sort((a, b) => Number(b.best) - Number(a.best) || b.recommend - a.recommend);
  const goto = (src, rec, label) => `<button class="goto" type="button" data-goto="${src}" data-rec="${rec ?? ''}">${label} →</button>`;

  const nextBar = next ? `<a class="next" href="${esc(next.url)}" target="_blank" rel="noopener noreferrer">
      <span class="k">다음 발매</span><span class="t">${esc(next.title)}</span><span class="when">${esc(next.time)}${next.method ? ` · ${esc(next.method)}` : ''}</span>
    </a>` : '';

  const left = block('오늘 남은 발매', `${rows(remaining, (item) => releaseRow(item, now), { key: 'today-rel', empty: past.length ? '오늘 발매는 모두 시작됐습니다.' : '오늘 등록된 발매가 없습니다.', limit: 5 })}
      ${past.length ? `<details><summary class="more">이미 시작한 발매 ${past.length}건</summary>${rows(past, (item) => releaseRow(item, now), {})}</details>` : ''}`,
  { count: `${remaining.length}건`, aside: '<a href="#releases">전체 일정 →</a>' })
    + block('곧 발매', rows(later.slice(0, 4), (item) => releaseRow(item, now, { showDate: true }), { empty: '예정된 발매가 없습니다.' }),
      { aside: '<a href="#releases">더 보기 →</a>' });

  const right = block('노려 볼 발매', rows((sourcing.releases ?? []).slice(0, 4), recRow, { empty: '추천할 발매가 아직 없습니다.' }), { aside: goto('추천', '발매 예정', '전체') })
    + block('지금 뜨는 신상', rows((sourcing.products ?? []).slice(0, 4), recRow, { empty: '추천할 신상품이 아직 없습니다.' }), { aside: goto('추천', '신상품', '전체') })
    + block('저단가 회전', rows((sourcing.budget ?? []).slice(0, 3), recRow, { empty: '조건에 맞는 상품이 아직 없습니다.' }), { aside: goto('저단가', '', '전체') })
    + block('인기 핫딜', rows(hot.slice(0, 5), dealRow, { empty: '아직 추천이 쌓인 핫딜이 없습니다.' }), { aside: '<a href="#deals">전체 →</a>' });

  return `${nextBar}<div class="grid2"><div>${left}</div><div>${right}</div></div>`;
}

// ── 소싱 ─────────────────────────────

const SRC_VIEWS = ['추천', '저단가', '자주 뜸', '크림', 'sibna'];
const KREAM_VIEWS = ['순위 급상승', '관심 급증', '뜨는 신상', '발매가 대비', '거래 급증', '전체 랭킹'];
const SIBNA_LISTS = { '거래 활발': 'sales', 프리미엄: 'premium', '정가 이하': 'under', 신규: 'new' };

function sourcingBody() {
  const t = feed.trends ?? {};
  const s = t.sourcing ?? {};
  if (state.src === '추천') {
    const isRelease = state.rec === '발매 예정';
    return `${seg(['발매 예정', '신상품'], state.rec, 'rec', 'subseg')}
      ${rows((isRelease ? s.releases : s.products) ?? [], recRow, { key: `rec-${state.rec}`, empty: '추천할 항목이 아직 없습니다.' })}
      <p class="foot">${isRelease
    ? '뜨는 브랜드, 이름이 비슷한 크림 상품의 웃돈, 관심 키워드, 응모 여부로 점수를 매깁니다. 줄을 누르면 발매처와 검색 버튼이 나옵니다.'
    : '크림 뜨는 신상·sibna 신규 중 자주 보이고 웃돈이 붙거나 관심이 느는 상품입니다. 정가보다 10% 넘게 싼 것은 뺍니다.'}</p>`;
  }
  if (state.src === '저단가') {
    return `${rows(s.budget ?? [], recRow, { key: 'budget', empty: '조건에 맞는 상품이 아직 없습니다.' })}
      <p class="foot">크림 시세 6만 원 이하 중 자주 보이고 거래가 많은 상품입니다. 할인·쿠폰으로 싸게 사서 회전시키기 좋은 후보예요. 재고는 확인하지 않습니다.</p>`;
  }
  if (state.src === '자주 뜸') {
    const list = t.frequent?.windows?.[parseInt(state.freq, 10)] ?? [];
    return `${seg(['1일', '3일', '7일'], state.freq, 'freq', 'subseg')}
      ${rows(list, frequentRow, { key: `freq-${state.freq}`, empty: '기록이 쌓이면 표시됩니다.' })}
      <p class="foot">"3일 · 5회"는 기간 중 3일 동안 크림 랭킹·뜨는 신상·sibna 4개 목록에 합쳐 5번 나왔다는 뜻입니다.</p>`;
  }
  if (state.src === '크림') {
    const k = t.kream;
    const pick = {
      '순위 급상승': k?.rankRisers, '관심 급증': k?.wishRisers, '뜨는 신상': k?.fresh,
      '발매가 대비': k?.premium, '거래 급증': k?.tradeRisers, '전체 랭킹': k?.ranking,
    }[state.kream] ?? [];
    const recorded = k?.updatedAt ? `${relativeTime(k.updatedAt)} 기록` : '';
    return `${seg(KREAM_VIEWS, state.kream, 'kream', 'subseg')}
      ${rows(pick, kreamRow, { key: `kream-${state.kream}`, empty: k ? '이 조건의 상품이 아직 없습니다.' : 'PC 크롬 확장이 기록을 올리면 표시됩니다.' })}
      <p class="foot">${esc(recorded)} · PC 크롬이 켜져 있으면 2시간마다 랭킹·뜨는 신상 각 50개와 상품 20개의 관심수·발매가를 읽습니다.</p>`;
  }
  const rank = t.sibnaRank;
  const items = rank?.lists?.[SIBNA_LISTS[state.sibna]] ?? [];
  return `${seg(Object.keys(SIBNA_LISTS), state.sibna, 'sibna', 'subseg')}
    ${rows(items, sibnaRow, { key: `sibna-${state.sibna}`, empty: '아직 기록이 없습니다.' })}
    <p class="foot">${rank ? `${esc(relativeTime(rank.fetchedAt))} 기록 · ` : ''}${ext('https://sibna.kr/today/kream_rank', 'sibna 크림 랭킹 원문 ↗', '')}</p>`;
}

const renderTrends = () => `${seg(SRC_VIEWS, state.src, 'src', 'seg sticky')}${sourcingBody()}`;

// ── 발매·핫딜·더보기 ─────────────────────────────

const hasText = (text, query) => !query || text.toLowerCase().includes(query.toLowerCase());

function renderReleases() {
  const now = kstNow();
  const methods = ['전체', ...new Set(feed.releases.map((item) => item.method).filter(Boolean))];
  const items = feed.releases
    .filter((item) => hasText(item.title, state.releaseQuery))
    .filter((item) => state.releaseMethod === '전체' || item.method === state.releaseMethod);
  const groups = new Map();
  items.forEach((item) => groups.set(item.date, [...(groups.get(item.date) ?? []), item]));
  const body = items.length
    ? `<div class="rows">${[...groups].map(([date, group]) => `<div class="day">${esc(dayLabel(date))} · ${group.length}건</div>${group.map((item) => releaseRow(item, now)).join('')}`).join('')}</div>`
    : '<div class="rows"><p class="empty">조건에 맞는 발매가 없습니다.</p></div>';
  return `<div class="toolbar">${searchBox('releaseQuery', state.releaseQuery, '브랜드·상품 검색 (예: 나이키)')}</div>
    ${seg(methods, state.releaseMethod, 'releaseMethod', 'subseg')}
    <div id="results">${body}</div>`;
}

function renderDeals() {
  const categories = ['전체', 'BEST', ...new Set(hotDeals().map((item) => item.category).filter(Boolean))];
  const items = hotDeals()
    .filter((item) => hasText(item.name, state.dealQuery))
    .filter((item) => state.dealCategory === '전체' || (state.dealCategory === 'BEST' ? item.best : item.category === state.dealCategory));
  return `<div class="toolbar">${searchBox('dealQuery', state.dealQuery, '상품·판매처 검색')}</div>
    ${seg(categories, state.dealCategory, 'dealCategory', 'subseg')}
    <div id="results">${rows(items, dealRow, { key: 'deals', empty: '조건에 맞는 핫딜이 없습니다.', limit: 20 })}</div>`;
}

const linkRows = (links) => `<div class="rows">${links.map((l) => `<a class="linkrow" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}<span>열기 ↗</span></a>`).join('')}</div>`;

function renderMore() {
  const shortcuts = feed.shortcuts ?? {};
  const news = (feed.news ?? []).map((item) => `<a class="news" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="k">${esc(item.section)}</div><div class="t">${esc(item.title)}</div>${item.summary ? `<div class="s">${esc(item.summary)}</div>` : ''}
    </a>`);
  const insta = [
    ...(shortcuts.instagramAccounts ?? []).map((h) => ({ label: `@${h}`, url: `https://www.instagram.com/${encodeURIComponent(h)}/` })),
    ...(shortcuts.instagramTags ?? []).map((tag) => ({ label: `#${tag}`, url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/` })),
  ];
  const status = (feed.sources ?? []).map((s) => `<div class="${s.ok ? '' : 'bad'}">${esc(s.name)}: ${s.ok ? '정상' : '수집 실패, 이전 데이터 표시 중'}</div>`).join('');
  const app = feed.repo ? [{ label: '안드로이드 앱 받기 (알림용)', url: `https://github.com/${feed.repo}/releases/latest/download/deal-radar.apk` }] : [];
  const left = block('오늘의 발매뉴스', `<div class="rows">${news.join('') || '<p class="empty">수집된 뉴스가 없습니다.</p>'}</div>`);
  const right = block('바로가기', linkRows([...app, ...(shortcuts.musinsa ?? []), ...(shortcuts.sources ?? [])]))
    + (insta.length ? block('인스타그램', linkRows(insta)) : '')
    + block('수집 상태', `<div class="rows status">${status}</div>`);
  return `<div class="grid2"><div>${left}</div><div>${right}</div></div>`;
}

// ── 그리기·이벤트 ─────────────────────────────

const RENDERERS = { today: renderToday, trends: renderTrends, releases: renderReleases, deals: renderDeals, more: renderMore };

function currentTab() {
  const hash = location.hash.slice(1);
  const tab = ALIASES[hash] ?? hash;
  return TABS.includes(tab) ? tab : 'today';
}

function bindThumbs(root) {
  root.querySelectorAll('[data-thumb]').forEach((img) => {
    img.addEventListener('error', () => img.removeAttribute('src'), { once: true });
  });
}

function render() {
  const tab = currentTab();
  document.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (!feed) return;
  // 다시 그려도 펼쳐 둔 줄은 유지한다.
  const opened = [...view.querySelectorAll('details[open] .name')].map((el) => el.textContent);
  view.innerHTML = RENDERERS[tab]();
  view.querySelectorAll('details .name').forEach((el) => {
    if (opened.includes(el.textContent)) el.closest('details').open = true;
  });
  bindThumbs(view);
}

/** 검색 입력은 결과 칸만 바꿔 커서를 잃지 않게 한다. */
function renderResults() {
  const box = document.getElementById('results');
  const fresh = document.createElement('div');
  fresh.innerHTML = RENDERERS[currentTab()]();
  const next = fresh.querySelector('#results');
  if (box && next) {
    box.replaceWith(next);
    bindThumbs(next);
  }
}

view.addEventListener('input', (event) => {
  const name = event.target.dataset?.search;
  if (!name) return;
  state[name] = event.target.value.trim();
  renderResults();
});

view.addEventListener('click', (event) => {
  const set = event.target.closest('[data-set]');
  if (set) {
    state[set.dataset.set] = set.dataset.value;
    render();
    return;
  }
  const more = event.target.closest('[data-more]');
  if (more) {
    state.open.add(more.dataset.more);
    render();
    return;
  }
  const goto = event.target.closest('[data-goto]');
  if (goto) {
    state.src = goto.dataset.goto;
    if (goto.dataset.rec) state.rec = goto.dataset.rec;
    location.hash = 'trends';
  }
});

function renderHeader() {
  document.title = feed.siteName ?? '딜레이더';
  updated.textContent = `${relativeTime(feed.generatedAt)} 갱신`;
  const problems = [];
  if (Date.now() - Date.parse(feed.generatedAt) > STALE_MS) problems.push('자동 갱신이 2시간 넘게 멈춰 있습니다.');
  const failed = (feed.sources ?? []).filter((s) => !s.ok).map((s) => s.name);
  if (failed.length) problems.push(`${failed.join(', ')} 수집에 실패해 이전 데이터를 보여줍니다.`);
  alertBox.hidden = problems.length === 0;
  alertBox.textContent = problems.join(' ');
}

async function load() {
  try {
    const res = await fetch(`data/feed.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const next = await res.json();
    const changed = !feed || next.generatedAt !== feed.generatedAt;
    feed = next;
    renderHeader();
    // 검색 입력 중에 화면이 다시 그려져 커서를 잃지 않게 한다.
    if (changed && !document.activeElement?.matches?.('.search')) render();
  } catch (error) {
    if (!feed) view.innerHTML = '<p class="empty">데이터를 불러오지 못했습니다. 잠시 후 다시 열어주세요.</p>';
    console.error(error);
  }
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});
setInterval(load, REFRESH_MS);

render();
load();
