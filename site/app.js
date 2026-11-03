const REFRESH_MS = 5 * 60 * 1000;
const NEW_WINDOW_MS = 3 * 60 * 60 * 1000;
const STALE_MS = 2 * 60 * 60 * 1000;
const TABS = ['today', 'releases', 'deals', 'news', 'links'];

const view = document.getElementById('view');
const updated = document.getElementById('updated');
const alertBox = document.getElementById('alert');

let feed = null;
const filters = { releaseQuery: '', releaseMethod: '전체', dealQuery: '', dealCategory: '전체' };

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
  const hot = [...feed.deals]
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
  const items = feed.deals
    .filter((item) => hasText(item, filters.dealQuery))
    .filter((item) => {
      if (filters.dealCategory === '전체') return true;
      if (filters.dealCategory === 'BEST') return item.best;
      return item.category === filters.dealCategory;
    });
  return list(items.map(dealRow), '조건에 맞는 핫딜이 없습니다.');
}

function renderDeals() {
  const categories = ['전체', 'BEST', ...new Set(feed.deals.map((item) => item.category).filter(Boolean))];
  return `<div class="controls">
      ${searchBox('dealQuery', filters.dealQuery, '상품·판매처 검색')}
      ${chips(categories, filters.dealCategory, 'dealCategory')}
    </div>
    <div id="results">${dealResults()}</div>`;
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

const RENDERERS = { today: renderToday, releases: renderReleases, deals: renderDeals, news: renderNews, links: renderLinks };

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
  const box = document.getElementById('results');
  if (!box) return;
  box.innerHTML = currentTab() === 'releases' ? releaseResults() : dealResults();
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
