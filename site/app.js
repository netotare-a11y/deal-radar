const REFRESH_MS = 5 * 60 * 1000;
const NEW_WINDOW_MS = 3 * 60 * 60 * 1000;
const STALE_MS = 2 * 60 * 60 * 1000;
const TABS = ['today', 'trends', 'releases', 'deals', 'news', 'links'];

const view = document.getElementById('view');
const updated = document.getElementById('updated');
const alertBox = document.getElementById('alert');

let feed = null;
// KREAM 소싱 알림은 앱 알림용으로 deals 에 섞여 오므로 핫딜 목록에서는 뺀다.
const hotDeals = () => feed.deals.filter((item) => item.kind !== 'kream');
const filters = { releaseQuery: '', releaseMethod: '전체', dealQuery: '', dealCategory: '전체', kreamView: '순위 급상승', freqDays: '7일', sibnaList: '거래 활발', recView: '발매 예정' };

// 피드 내용은 외부 사이트에서 온 값이다. 화면에 넣을 때 항상 이스케이프한다.
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function kstNow() {
  const iso = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(ymd) {
  const { date: today } = kstNow();
  const diff = Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const d = new Date(`${ymd}T00:00:00Z`);
  const base = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `내일 · ${base}`;
  return base;
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

function thumb(url) {
  return url
    ? `<img class="thumb" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-thumb>`
    : '<div class="thumb"></div>';
}

function isPast(item, now) {
  return item.date === now.date && item.time && item.time < now.time;
}

function releaseRow(item, now, { showDate = false } = {}) {
  const method = item.method ? `<span class="tag ${item.method === '응모' ? 'draw' : ''}">${esc(item.method)}</span>` : '';
  const watch = item.watched ? '<span class="tag watch">관심</span>' : '';
  const fresh = isNew(item) ? '<span class="new">NEW</span>' : '';
  const shortDate = `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}`;
  const time = showDate
    ? `<div class="time">${esc(shortDate)}</div>`
    : `<div class="time ${item.time ? '' : 'none'}">${esc(item.time || '미정')}</div>`;
  const clock = showDate && item.time ? `<span>${esc(item.time)}</span>` : '';
  return `<a class="row ${isPast(item, now) ? 'past' : ''}" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    ${time}${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.title)}</div>
      <div class="meta">${clock}${method}${watch}${fresh}</div>
    </div>
  </a>`;
}

function dealRow(item) {
  const price = item.price ? `<span class="price">${esc(item.price)}</span>` : '';
  const best = item.best ? '<span class="tag best">BEST</span>' : '';
  const watch = item.watched ? '<span class="tag watch">관심</span>' : '';
  const stats = [
    item.store,
    item.recommend ? `추천 ${item.recommend}` : '',
    item.replies ? `댓글 ${item.replies}` : '',
    item.postedAt ? relativeTime(item.postedAt) : '',
  ].filter(Boolean).map((text) => `<span>${esc(text)}</span>`).join('');
  return `<a class="row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    ${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.name)}</div>
      <div class="meta">${price}${best}${watch}${stats}</div>
    </div>
  </a>`;
}

const list = (rows, emptyText) => (rows.length
  ? `<div class="list">${rows.join('')}</div>`
  : `<div class="list"><p class="empty">${esc(emptyText)}</p></div>`);

function renderToday() {
  const now = kstNow();
  const today = feed.releases.filter((item) => item.date === now.date);
  const remaining = today.filter((item) => !isPast(item, now));
  const past = today.filter((item) => isPast(item, now));
  const upcoming = remaining.find((item) => item.time);
  const later = feed.releases.filter((item) => item.date > now.date).slice(0, 6);
  const hot = [...hotDeals()]
    .filter((deal) => deal.best || deal.recommend > 0)
    .sort((a, b) => Number(b.best) - Number(a.best) || b.recommend - a.recommend)
    .slice(0, 6);

  const nextCard = upcoming ? `
    <a class="next" href="${esc(upcoming.url)}" target="_blank" rel="noopener noreferrer">
      ${thumb(upcoming.image)}
      <div class="body">
        <div class="next-label">다음 발매 · ${esc(upcoming.time)}</div>
        <div class="next-title">${esc(upcoming.title)}</div>
        <div class="meta">${upcoming.method ? `<span class="tag">${esc(upcoming.method)}</span>` : ''}</div>
      </div>
    </a>` : '';

  return `${nextCard}
    <section class="section">
      <div class="section-head"><h2>오늘 남은 발매<span class="day-count">${remaining.length}건</span></h2><a href="#releases">전체 일정</a></div>
      ${list(remaining.map((item) => releaseRow(item, now)), past.length ? '오늘 발매는 모두 시작되었습니다.' : '오늘 등록된 발매가 없습니다.')}
      ${past.length ? `<details class="past-group">
        <summary>이미 시작한 발매 ${past.length}건</summary>
        ${list(past.map((item) => releaseRow(item, now)), '')}
      </details>` : ''}
    </section>
    <section class="section">
      <div class="section-head"><h2>인기 핫딜</h2><a href="#deals">전체 핫딜</a></div>
      ${list(hot.map(dealRow), '아직 추천이 쌓인 핫딜이 없습니다.')}
    </section>
    ${later.length ? `<section class="section">
      <div class="section-head"><h2>곧 발매</h2><a href="#releases">더 보기</a></div>
      ${list(later.map((item) => releaseRow(item, now, { showDate: true })), '')}
    </section>` : ''}`;
}

function chips(values, selected, name) {
  return `<div class="chips" role="group">${values.map((value) => (
    `<button class="chip" type="button" data-filter="${name}" data-value="${esc(value)}" aria-pressed="${value === selected}">${esc(value)}</button>`
  )).join('')}</div>`;
}

function searchBox(name, value, placeholder) {
  return `<input class="search" type="search" data-search="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">`;
}

const hasText = (item, query) => !query || item.title.toLowerCase().includes(query.toLowerCase());

function releaseResults() {
  const now = kstNow();
  const items = feed.releases
    .filter((item) => hasText(item, filters.releaseQuery))
    .filter((item) => filters.releaseMethod === '전체' || item.method === filters.releaseMethod);
  if (!items.length) return list([], '조건에 맞는 발매가 없습니다.');

  const byDate = new Map();
  items.forEach((item) => byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]));
  return [...byDate].map(([date, group]) => `
    <section class="section">
      <div class="section-head"><h2>${esc(dayLabel(date))}<span class="day-count">${group.length}건</span></h2></div>
      ${list(group.map((item) => releaseRow(item, now)), '')}
    </section>`).join('');
}

function renderReleases() {
  const methods = ['전체', ...new Set(feed.releases.map((item) => item.method).filter(Boolean))];
  return `<div class="controls">
      ${searchBox('releaseQuery', filters.releaseQuery, '브랜드·상품 검색 (예: 나이키, 무신사)')}
      ${chips(methods, filters.releaseMethod, 'releaseMethod')}
    </div>
    <div id="results">${releaseResults()}</div>`;
}

function dealResults() {
  const items = hotDeals()
    .filter((item) => hasText(item, filters.dealQuery))
    .filter((item) => {
      if (filters.dealCategory === '전체') return true;
      if (filters.dealCategory === 'BEST') return item.best;
      return item.category === filters.dealCategory;
    });
  return list(items.map(dealRow), '조건에 맞는 핫딜이 없습니다.');
}

function renderDeals() {
  const categories = ['전체', 'BEST', ...new Set(hotDeals().map((item) => item.category).filter(Boolean))];
  return `<div class="controls">
      ${searchBox('dealQuery', filters.dealQuery, '상품·판매처 검색')}
      ${chips(categories, filters.dealCategory, 'dealCategory')}
    </div>
    <div id="results">${dealResults()}</div>`;
}

const won = (value) => (Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : '');

function kreamRow(item) {
  const change = item.isNewRank || item.enteredRanking
    ? '<span class="delta up">신규</span>'
    : item.rankChange > 0
      ? `<span class="delta up">▲${item.rankChange}</span>`
      : item.rankChange < 0
        ? `<span class="delta down">▼${Math.abs(item.rankChange)}</span>`
        : '';
  const wish = item.wishDelta > 0
    ? `<span class="delta up">관심 +${item.wishDelta.toLocaleString('ko-KR')}${item.wishGrowth === null ? '' : ` (${item.wishGrowth.toFixed(1)}%)`}</span>`
    : Number.isFinite(item.wish) ? `<span>관심 ${item.wish.toLocaleString('ko-KR')}</span>` : '';
  const premium = Number.isFinite(item.premiumPct)
    ? `<span class="delta ${item.premiumPct > 0 ? 'up' : 'down'}">발매가 ${esc(won(item.releasePrice))} 대비 ${item.premiumPct > 0 ? '+' : ''}${item.premiumPct.toFixed(0)}%</span>`
    : '';
  const tradeGain = item.tradesDelta > 0
    ? `<span class="delta up">거래 +${item.tradesDelta.toLocaleString('ko-KR')}${item.tradesGrowth === null ? '' : ` (${item.tradesGrowth.toFixed(1)}%)`}</span>`
    : '';
  const trades = Number.isFinite(item.trades) ? `<span>거래 ${item.trades.toLocaleString('ko-KR')}</span>` : '';
  const released = item.releaseDate ? `<span>발매 ${esc(item.releaseDate.slice(2).replaceAll('-', '.'))}</span>` : '';
  const badge = item.badge ? `<span class="tag best">${esc(item.badge)}</span>` : '';
  return `<a class="row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    <div class="time">${esc(item.rank ?? '')}</div>${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.name)}</div>
      <div class="meta"><span class="price">${esc(won(item.price))}</span>${change}${wish}${premium}${tradeGain}${trades}${released}${badge}</div>
    </div>
  </a>`;
}

const KREAM_VIEWS = ['순위 급상승', '관심 급증', '뜨는 신상', '발매가 대비', '거래 급증', '전체 랭킹'];

function kreamResults() {
  const kream = feed.trends?.kream;
  if (!kream) return list([], '아직 기록이 없습니다. PC 크롬이 켜져 있으면 2시간마다 자동으로 모읍니다.');
  const view = filters.kreamView;
  if (view === '관심 급증') {
    return list(kream.wishRisers.map(kreamRow), '관심수 기록이 1시간 이상 쌓이면 표시됩니다.');
  }
  if (view === '뜨는 신상') return list(kream.fresh.map(kreamRow), '아직 뜨는 신상 기록이 없습니다.');
  if (view === '발매가 대비') return list(kream.premium.map(kreamRow), '발매가보다 비싸게 거래되는 상품이 아직 없습니다.');
  if (view === '거래 급증') {
    if (!kream.baselineAt) return list([], '비교할 이전 기록이 쌓이면 표시됩니다.');
    return list(kream.tradeRisers.map(kreamRow), '이전 기록보다 거래 수가 늘어난 상품이 없습니다.');
  }
  if (view === '순위 급상승') return list(kream.rankRisers.map(kreamRow), '순위가 오른 상품이 없습니다.');
  return list(kream.ranking.map(kreamRow), '');
}

function musinsaRow(item) {
  const fresh = item.isNew ? '<span class="new">NEW</span>' : '';
  const discount = item.discount ? `<span class="tag draw">${esc(item.discount)}%</span>` : '';
  return `<a class="row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    ${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.name)}</div>
      <div class="meta"><span class="price">${esc(won(item.price))}</span>${discount}${fresh}<span>${esc(item.brand)}</span></div>
    </div>
  </a>`;
}

function recordedLabel(trend) {
  if (!trend?.updatedAt) return '';
  const base = trend.baselineAt ? ` · ${relativeTime(trend.baselineAt)} 기록과 비교` : '';
  return `${relativeTime(trend.updatedAt)} 기록${base}`;
}

// 발매 예정 상품을 크림 검색으로 바로 연결한다. 이름이 사이트마다 달라 자동으로 짝짓지는 않는다.
function upcomingRow(item) {
  const shortDate = `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}`;
  const method = item.method ? `<span class="tag ${item.method === '응모' ? 'draw' : ''}">${esc(item.method)}</span>` : '';
  return `<a class="row" href="https://kream.co.kr/search?keyword=${encodeURIComponent(item.title)}" target="_blank" rel="noopener noreferrer">
    <div class="time">${esc(shortDate)}</div>${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.title)}</div>
      <div class="meta">${item.time ? `<span>${esc(item.time)}</span>` : ''}${method}<span>크림 시세 보기 ↗</span></div>
    </div>
  </a>`;
}

const SIBNA_LISTS = { '거래 활발': 'sales', '프리미엄': 'premium', '정가 이하': 'under', '신규': 'new' };

const pct = (value) => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : '');

function frequentRow(item, index) {
  const vs = Number.isFinite(item.vsRetail)
    ? `<span class="delta ${item.vsRetail > 0 ? 'up' : 'down'}">정가 대비 ${esc(pct(item.vsRetail))}</span>` : '';
  return `<a class="row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    <div class="time">${index + 1}</div>${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.name)}</div>
      <div class="meta"><span class="delta up">${item.days}일 · ${item.hits}회</span><span class="price">${esc(won(item.price))}</span>${vs}</div>
      <div class="meta">${item.sources.map((source) => `<span class="tag">${esc(source)}</span>`).join('')}</div>
    </div>
  </a>`;
}

function sibnaRow(item) {
  const vs = Number.isFinite(item.vsRetail)
    ? `<span class="delta ${item.vsRetail > 0 ? 'up' : 'down'}">정가 대비 ${esc(pct(item.vsRetail))}</span>` : '';
  return `<a class="row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    <div class="time">${esc(item.rank)}</div>${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.name)}</div>
      <div class="meta"><span class="price">${esc(won(item.price))}</span>${vs}${item.activity ? `<span>활발도 ${esc(item.activity)}</span>` : ''}<span>${esc(item.brand)}</span></div>
    </div>
  </a>`;
}

function renderFrequent() {
  const frequent = feed.trends?.frequent;
  const rows = frequent?.windows?.[parseInt(filters.freqDays, 10)] ?? [];
  return `<section class="section">
      <div class="section-head"><h2>자주 뜨는 상품</h2><span>크림 랭킹·뜨는 신상·sibna 4개 목록</span></div>
      <div class="controls">${chips(['1일', '3일', '7일'], filters.freqDays, 'freqDays')}</div>
      ${list(rows.map(frequentRow), '기록이 쌓이면 표시됩니다. 하루에 한 번씩 쌓입니다.')}
      <p class="hint">"3일 · 5회"는 기간 중 3일 동안, 날짜와 목록을 합쳐 5번 나왔다는 뜻입니다. 같은 날 같은 목록은 한 번만 셉니다.</p>
    </section>`;
}

function renderSibnaRank() {
  const rank = feed.trends?.sibnaRank;
  if (!rank) return '';
  const items = rank.lists[SIBNA_LISTS[filters.sibnaList]] ?? [];
  return `<section class="section">
      <div class="section-head"><h2>sibna 크림 랭킹</h2><a href="https://sibna.kr/today/kream_rank" target="_blank" rel="noopener noreferrer">${esc(relativeTime(rank.fetchedAt))} 기록 ↗</a></div>
      <div class="controls">${chips(Object.keys(SIBNA_LISTS), filters.sibnaList, 'sibnaList')}</div>
      ${list(items.map(sibnaRow), '이 목록은 비어 있습니다.')}
    </section>`;
}

function linkButtons(item) {
  const stores = (item.storeLinks ?? []).map((link) => ({ ...link, label: `발매처 · ${link.label}`, main: true }));
  const post = item.postUrl ? [{ label: '발매 정보', url: item.postUrl }] : [];
  return [...stores, ...post, ...item.links].map((link) => (
    `<a class="btn-link ${link.main ? 'main' : ''}" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)} ↗</a>`
  )).join('');
}

function recRow(item, index) {
  const when = item.date
    ? `<span class="delta up">${esc(`${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}`)}${item.time ? ` ${esc(item.time)}` : ''}</span>${item.method ? `<span class="tag ${item.method === '응모' ? 'draw' : ''}">${esc(item.method)}</span>` : ''}`
    : `<span class="price">${esc(won(item.price))}</span>`;
  const similar = item.similar
    ? `<div class="meta"><a class="similar" href="${esc(item.similar.url)}" target="_blank" rel="noopener noreferrer">비슷한 크림 상품: ${esc(item.similar.name)} ↗</a></div>` : '';
  return `<div class="row rec">
    <div class="time">${index + 1}</div>${thumb(item.image)}
    <div class="body">
      <div class="title">${esc(item.name)}</div>
      <div class="meta">${when}<span class="score">점수 ${esc(item.score)}</span></div>
      <div class="meta">${item.reasons.map((reason) => `<span class="tag">${esc(reason)}</span>`).join('')}</div>
      ${similar}
      <div class="btns">${linkButtons(item)}</div>
    </div>
  </div>`;
}

function renderSourcing() {
  const sourcing = feed.trends?.sourcing;
  if (!sourcing) return '';
  const isRelease = filters.recView === '발매 예정';
  const rows = isRelease ? sourcing.releases : sourcing.products;
  return `<section class="section">
      <div class="section-head"><h2>소싱 추천</h2><span>크림·sibna 흐름 기준</span></div>
      <div class="controls">${chips(['발매 예정', '신상품'], filters.recView, 'recView')}</div>
      ${list(rows.map(recRow), isRelease ? '추천할 발매가 아직 없습니다.' : '추천할 신상품이 아직 없습니다.')}
      <p class="hint">${isRelease
        ? '요즘 크림·sibna에서 자주 뜨는 브랜드, 이름이 비슷한 크림 상품의 웃돈, 관심 키워드, 응모 여부로 점수를 매깁니다. 비슷한 상품은 이름으로 추정한 것입니다.'
        : '크림 뜨는 신상·sibna 신규 중 자주 등장하고 정가보다 비싸게 거래되며 관심이 느는 상품입니다. 정가보다 10% 넘게 싸게 거래되는 상품은 뺍니다.'}</p>
    </section>`;
}

function renderTrends() {
  const { kream, musinsa } = feed.trends ?? {};
  const now = kstNow();
  const upcoming = feed.releases.filter((item) => item.date >= now.date && !isPast(item, now))
    .sort((a, b) => Number(b.watched) - Number(a.watched)).slice(0, 12);
  return `${renderSourcing()}${renderFrequent()}
    <section class="section">
      <div class="section-head"><h2>KREAM 소싱</h2><span>${esc(recordedLabel(kream))}</span></div>
      <div class="controls">${chips(KREAM_VIEWS, filters.kreamView, 'kreamView')}</div>
      <div id="results">${kreamResults()}</div>
      <p class="hint">PC 크롬이 켜져 있으면 2시간마다 랭킹·뜨는 신상 각 50개와 급상승 상품 20개의 관심수·발매가를 읽습니다.</p>
    </section>
    <section class="section">
      <div class="section-head"><h2>곧 발매 · 크림 시세 확인</h2><a href="#releases">전체 일정</a></div>
      ${list(upcoming.map(upcomingRow), '예정된 발매가 없습니다.')}
    </section>
    ${renderSibnaRank()}
    ${musinsa ? `<section class="section">
      <div class="section-head"><h2>무신사 추천</h2><span>${esc(recordedLabel(musinsa))}</span></div>
      ${list(musinsa.items.map(musinsaRow), '')}
    </section>` : ''}`;
}

function renderNews() {
  const rows = feed.news.map((item) => `
    <a class="news-row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="news-section">${esc(item.section)}</div>
      <div class="news-title">${esc(item.title)}</div>
      ${item.summary ? `<div class="news-summary">${esc(item.summary)}</div>` : ''}
    </a>`);
  const musinsa = feed.shortcuts?.musinsa ?? [];
  return `<section class="section">
      <div class="section-head"><h2>오늘의 발매뉴스</h2><span>today</span></div>
      ${list(rows, '수집된 뉴스가 없습니다.')}
    </section>
    <section class="section">
      <div class="section-head"><h2>무신사</h2></div>
      ${linkList(musinsa)}
    </section>`;
}

function linkList(links) {
  return `<div class="list">${links.map((link) => `
    <a class="link-row" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}<span>열기 ↗</span></a>`).join('')}</div>`;
}

function renderLinks() {
  const shortcuts = feed.shortcuts ?? {};
  const accounts = (shortcuts.instagramAccounts ?? []).map((handle) => ({
    label: `@${handle}`,
    url: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
  }));
  const tags = (shortcuts.instagramTags ?? []).map((tag) => ({
    label: `#${tag}`,
    url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
  }));
  const status = (feed.sources ?? []).map((source) => (
    `<div class="${source.ok ? '' : 'bad'}">${esc(source.name)}: ${source.ok ? '정상' : '수집 실패, 이전 데이터 표시 중'}</div>`
  )).join('');
  const appLink = feed.repo
    ? linkList([{ label: '안드로이드 앱 받기 (알림용)', url: `https://github.com/${feed.repo}/releases/latest/download/deal-radar.apk` }])
    : '';

  return `${appLink ? `<section class="section">
      <div class="section-head"><h2>앱</h2></div>
      ${appLink}
    </section>` : ''}
    <section class="section">
      <div class="section-head"><h2>인스타그램</h2></div>
      ${linkList([...accounts, ...tags])}
      ${accounts.length ? '' : '<p class="hint">자주 보는 계정을 config.json에 넣으면 여기에 나타납니다.</p>'}
    </section>
    <section class="section">
      <div class="section-head"><h2>무신사</h2></div>
      ${linkList(shortcuts.musinsa ?? [])}
    </section>
    <section class="section">
      <div class="section-head"><h2>원본 사이트</h2></div>
      ${linkList(shortcuts.sources ?? [])}
    </section>
    <section class="section">
      <div class="section-head"><h2>수집 상태</h2></div>
      <div class="status">${status}</div>
    </section>`;
}

const RENDERERS = { today: renderToday, trends: renderTrends, releases: renderReleases, deals: renderDeals, news: renderNews, links: renderLinks };

function currentTab() {
  const hash = location.hash.slice(1);
  return TABS.includes(hash) ? hash : 'today';
}

function render() {
  const tab = currentTab();
  document.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (!feed) return;
  view.innerHTML = RENDERERS[tab]();
  bindThumbs(view);
}

function bindThumbs(root) {
  root.querySelectorAll('[data-thumb]').forEach((img) => {
    img.addEventListener('error', () => img.removeAttribute('src'), { once: true });
  });
}

function renderResults() {
  // 소싱 탭은 버튼 묶음이 여러 개라 탭 전체를 다시 그린다.
  if (currentTab() === 'trends') {
    render();
    return;
  }
  const box = document.getElementById('results');
  if (!box) return;
  const results = { releases: releaseResults, deals: dealResults, trends: kreamResults };
  box.innerHTML = results[currentTab()]();
  bindThumbs(box);
}

view.addEventListener('input', (event) => {
  const name = event.target.dataset?.search;
  if (!name) return;
  filters[name] = event.target.value.trim();
  renderResults();
});

view.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-filter]');
  if (!chip) return;
  filters[chip.dataset.filter] = chip.dataset.value;
  chip.parentElement.querySelectorAll('[data-filter]').forEach((el) => {
    el.setAttribute('aria-pressed', String(el === chip));
  });
  renderResults();
});

function renderHeader() {
  document.title = feed.siteName ?? '딜레이더';
  updated.textContent = `${relativeTime(feed.generatedAt)} 갱신`;

  const problems = [];
  if (Date.now() - Date.parse(feed.generatedAt) > STALE_MS) {
    problems.push('자동 갱신이 2시간 넘게 멈춰 있습니다.');
  }
  const failed = (feed.sources ?? []).filter((source) => !source.ok).map((source) => source.name);
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