import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../extension/extractor.js';
import '../extension/snapshot.js';
import { buildKreamTrend, buildMusinsaTrend, kreamAlerts, pickBaseline } from '../src/trends.mjs';

const { parseKreamLines, parseMusinsaLines } = globalThis.DealRadarExtractor;
const { mergeSnapshot } = globalThis.DealRadarSnapshot;

test('KREAM 실제 카드 글자를 읽는다', () => {
  const up = parseKreamLines(['거래 1,155', '2', '▲1', 'Nike Windrunner Jacket', '26%', '162,000원']);
  assert.deepEqual(
    [up.rank, up.rankChange, up.trades, up.price, up.name],
    [2, 1, 1155, 162000, 'Nike Windrunner Jacket'],
  );
  const down = parseKreamLines(['거래 1,046', '3', '▼1', 'Nike Black', '37%', '137,000원']);
  assert.equal(down.rankChange, -1);
  const same = parseKreamLines(['거래 2,395', '1', '-', 'IAB Studio Hoodie', '114,000원']);
  assert.equal(same.rankChange, 0);
  assert.equal(same.name, 'IAB Studio Hoodie');
  const fresh = parseKreamLines(['3', 'NEW', 'New Item', '10,000원']);
  assert.equal(fresh.isNewRank, true);
  assert.equal(fresh.trades, null);
  assert.equal(fresh.name, 'New Item');
});

test('상품명 속 숫자를 순위로 착각하지 않는다', () => {
  const parsed = parseKreamLines(['거래 7,247', '5', '-', 'Pokemon TCG 30th Pack 1 Box', '86,000원']);
  assert.equal(parsed.rank, 5);
  assert.equal(parsed.name, 'Pokemon TCG 30th Pack 1 Box');
});

test('무신사 실제 카드 글자를 읽는다', () => {
  const parsed = parseMusinsaLines(['일리고', '플랩 버클 스커트 팬츠', '28%', '66,600원', '내일도착']);
  assert.deepEqual(parsed, { brand: '일리고', name: '플랩 버클 스커트 팬츠', price: 66600, discount: 28 });
  assert.equal(parseMusinsaLines(['브랜드', '상품', '1,000원']).discount, null);
});

const records = (lines) => ({ items: lines.map((l, i) => ({ id: String(i + 1), url: `https://kream.co.kr/products/${i + 1}`, image: '', position: i + 1, lines: l })) });
const five = records([1, 2, 3, 4, 5].map((n) => ['거래 100', String(n), '-', `상품 ${n}`, '1,000원']));

test('기록 병합: 3시간 안이면 교체, 지나면 추가', () => {
  const first = mergeSnapshot(null, 'kream', five, '2026-11-03T00:00:00Z');
  assert.equal(first.history.length, 1);
  const soon = mergeSnapshot(first, 'kream', five, '2026-11-03T01:00:00Z');
  assert.equal(soon.history.length, 1);
  assert.equal(soon.history[0].at, '2026-11-03T01:00:00Z');
  const later = mergeSnapshot(soon, 'kream', five, '2026-11-03T05:00:00Z');
  assert.equal(later.history.length, 2);
});

test('상품이 너무 적게 읽히면 기록을 덮어쓰지 않는다', () => {
  const few = records([['거래 1', '1', '-', '상품', '1,000원']]);
  assert.throws(() => mergeSnapshot(null, 'kream', few, '2026-11-03T00:00:00Z'), /1개뿐/);
});

test('비교 기준: 하루 전 기록 우선, 없으면 1시간 이상 지난 가장 오래된 기록', () => {
  const at = (h) => ({ at: new Date(Date.UTC(2026, 10, 3, h)).toISOString() });
  const now = at(23).at;
  assert.equal(pickBaseline([at(23)], now), null);
  assert.equal(pickBaseline([at(22, 0), at(23)], now).at, at(22).at);
  assert.equal(pickBaseline([at(1), at(2), at(10), at(23)], now).at, at(2).at);
});

const kreamFile = {
  updatedAt: '2026-11-03T12:00:00Z',
  items: [
    { id: '1', url: 'https://kream.co.kr/products/1', name: 'A', rank: 1, rankChange: 0, trades: 150, price: 1000 },
    { id: '2', url: 'https://kream.co.kr/products/2', name: 'B', rank: 2, rankChange: 3, trades: 90, price: 2000 },
    { id: '3', url: 'https://kream.co.kr/products/3', name: 'C', rank: 3, rankChange: -1, trades: 500, price: 3000 },
    { id: '4', url: 'javascript:alert(1)', name: 'X', rank: 4, rankChange: 0, trades: 1 },
  ],
  history: [
    { at: '2026-11-02T10:00:00Z', items: { 1: [1, 100, 1000], 2: [5, 100, 2000] } },
    { at: '2026-11-03T12:00:00Z', items: {} },
  ],
};

test('KREAM 추세: 증가분만 급증에 넣고, 신규 진입과 위험한 링크를 처리한다', () => {
  const trend = buildKreamTrend(kreamFile);
  assert.equal(trend.ranking.length, 3);
  assert.deepEqual(trend.tradeRisers.map((i) => i.name), ['A']);
  assert.equal(trend.tradeRisers[0].tradesDelta, 50);
  assert.equal(trend.tradeRisers[0].tradesGrowth, 50);
  assert.equal(trend.ranking.find((i) => i.name === 'C').enteredRanking, true);
  assert.equal(trend.ranking.find((i) => i.name === 'B').tradesDelta, -10);
  assert.deepEqual(trend.rankRisers.map((i) => i.name), ['B', 'C']);
});

test('이전 기록이 없으면 급증 없이 KREAM 표시 변동만 쓴다', () => {
  const trend = buildKreamTrend({ ...kreamFile, history: [kreamFile.history[1]] });
  assert.equal(trend.baselineAt, null);
  assert.deepEqual(trend.tradeRisers, []);
  assert.deepEqual(trend.rankRisers.map((i) => i.name), ['B']);
});

test('무신사: 새로 등장한 상품을 앞에 둔다', () => {
  const trend = buildMusinsaTrend({
    updatedAt: '2026-11-03T12:00:00Z',
    items: [
      { id: '1', url: 'https://www.musinsa.com/products/1', name: '기존', brand: 'b', discount: 10, price: 1 },
      { id: '2', url: 'https://www.musinsa.com/products/2', name: '신규', brand: 'b', discount: null, price: 2 },
    ],
    history: [{ at: '2026-11-02T10:00:00Z', items: { 1: [null, null, 1] } }],
  });
  assert.deepEqual(trend.items.map((i) => [i.name, i.isNew]), [['신규', true], ['기존', false]]);
});

test('기록 파일이 없으면 null', () => {
  assert.equal(buildKreamTrend(null), null);
  assert.equal(buildMusinsaTrend({ items: [] }), null);
});

const { parseProductText, detectSite } = globalThis.DealRadarExtractor;
const { mergeDetails } = globalThis.DealRadarSnapshot;

test('KREAM 상품 페이지 실제 글자에서 발매가·발매일·거래·시세 변화·배지를 읽는다', () => {
  const text = ['관심 8.1만', '발매가 85,000원', '113,000원', '급상승 상의 1위', ' · ', '위클리 드랍', '6,671',
    '발매일 26/10/19', '발매가 85,000원', '거래 3,988', '▲ 20,000원(+16.8%)', '체결 거래'].join('\n');
  const parsed = parseProductText(text, '6,671', '113,000원');
  assert.deepEqual(parsed, {
    wish: 6671, price: 113000, releasePrice: 85000, releaseDate: '2026-10-19',
    trades: 3988, changePct: 16.8, badge: '급상승 상의 1위',
  });
  const down = parseProductText('▼ 5,000원(-3.2%)\n발매일 -', '1.2만', null);
  assert.deepEqual([down.changePct, down.wish, down.releaseDate, down.releasePrice], [-3.2, 12000, null, null]);
  assert.equal(detectSite(new URL('https://kream.co.kr/products/1016600')), 'kreamProduct');
});

test('관심수는 1시간 안이면 교체하고 지나면 쌓는다', () => {
  const d = (at, wish) => ({ id: '1', name: 'A', wish, releasePrice: 100, at });
  let merged = mergeDetails(null, [d('2026-11-13T00:00:00Z', 100)], '2026-11-13T00:00:00Z');
  merged = mergeDetails(merged, [d('2026-11-13T00:30:00Z', 110)], '2026-11-13T00:30:00Z');
  assert.deepEqual(merged['1'].wishes, [['2026-11-13T00:30:00Z', 110]]);
  merged = mergeDetails(merged, [d('2026-11-13T03:00:00Z', 500)], '2026-11-13T03:00:00Z');
  assert.equal(merged['1'].wishes.length, 2);
  const old = mergeDetails(merged, [], '2026-12-30T00:00:00Z');
  assert.deepEqual(old, {});
});

test('KREAM 소싱: 관심 급증·발매가 대비·뜨는 신상과 알림', () => {
  const trend = buildKreamTrend({
    ...kreamFile,
    fresh: [{ id: '9', url: 'https://kream.co.kr/products/9', name: '신상', rank: 1, price: 50000 }],
    details: {
      1: { name: 'A', wish: 1500, price: 1500, releasePrice: 1000, wishes: [['2026-11-02T12:00:00Z', 1000], ['2026-11-03T12:00:00Z', 1500]] },
      2: { name: 'B', wish: 10, releasePrice: 4000, wishes: [['2026-11-03T12:00:00Z', 10]] },
    },
  });
  const a = trend.ranking.find((i) => i.name === 'A');
  assert.deepEqual([a.wishDelta, a.wishGrowth, a.premiumPct, a.price], [500, 50, 50, 1500]);
  assert.deepEqual(trend.wishRisers.map((i) => i.name), ['A']);
  assert.deepEqual(trend.premium.map((i) => i.name), ['A']);
  assert.equal(trend.ranking.find((i) => i.name === 'B').premiumPct, -50);
  assert.deepEqual(trend.fresh.map((i) => i.name), ['신상']);

  const alerts = kreamAlerts(trend, { wishDelta: 300, rankRise: 3, premiumPct: 30, freshTop: 1 });
  assert.deepEqual(alerts.map((x) => x.id).sort(), [
    'kream-alert:kream:1:premium', 'kream-alert:kream:1:wish', 'kream-alert:kream:2:rank', 'kream-alert:kream:9:fresh',
  ]);
  assert.ok(alerts.every((x) => x.kind === 'kream' && x.alert && x.url.startsWith('https://kream.co.kr/')));
  assert.equal(alerts.find((x) => x.id.endsWith(':1:wish')).name, '관심 +500 · A');
  assert.deepEqual(kreamAlerts(null), []);
});
import { mergeDaily, parseKreamRank } from '../src/sources/sibnaKream.mjs';
import { buildFrequent } from '../src/trends.mjs';

const card = (id, rank, name, price, vs, label = '대표관측가') => `<a class="km-rank-card" href="https://sibna.kr/today/kream/${id}-Name?from=rank&amp;rank_tab=sales">
  <span class="km-card-thumb"><span class="km-rank-no">#${rank}</span><img src="https://sibna.kr/today/a/${id}.webp" alt=""></span>
  <span class="km-card-body"><span class="km-card-name km-marquee"><span class="km-marquee-text">${name}</span></span>
  <span class="km-card-sub km-marquee"><span class="km-marquee-text">Nike · DD1503-101</span></span>
  <span class="km-card-market"><span class="km-card-market-item"><span>${label}</span><strong>₩ ${price}</strong></span>
  <span class="km-card-market-item"><span>활발도</span><strong>매우 높음</strong></span>
  <span class="km-card-market-item"><span>정가대비</span><strong>${vs}</strong></span></span></span></a>`;

test('sibna 크림 랭킹: 목록별 상품을 읽고 번호를 크림 상품 번호로 쓴다', () => {
  const html = `<div data-rank-panel="sales">${card(28030, 1, '(W) 나이키 덩크 로우 블랙', '75,000', '-41.9%')}${card(51929, 2, '에어팟 &amp; 맥스', '1,120,000', '+45.6%', '최근거래가')}</div>
    <div data-rank-panel="new">${card(1181541, 1, '페가수스', '99,000', '-')}</div>`;
  const lists = parseKreamRank(html);
  assert.deepEqual(lists.sales.map((i) => [i.id, i.rank, i.price, i.vsRetail, i.brand]), [
    ['28030', 1, 75000, -41.9, 'Nike'], ['51929', 2, 1120000, 45.6, 'Nike'],
  ]);
  assert.equal(lists.sales[1].name, '에어팟 & 맥스');
  assert.equal(lists.new[0].vsRetail, null);
});

test('sibna 기록은 하루에 하나씩 최근 8일만 남긴다', () => {
  let file = null;
  for (let day = 1; day <= 10; day += 1) {
    const now = new Date(Date.UTC(2026, 10, day, 3));
    file = mergeDaily(file, { sales: [{ id: String(day), name: `상품${day}`, rank: 1 }] }, now);
  }
  file = mergeDaily(file, { sales: [{ id: '99', name: '같은 날', rank: 1 }] }, new Date(Date.UTC(2026, 10, 10, 5)));
  assert.equal(file.history.length, 8);
  assert.deepEqual(file.history.at(-1), { date: '2026-11-10', lists: { sales: ['99'] } });
  assert.equal(file.products['1'], undefined);
  assert.equal(file.products['9'].name, '상품9');
});

test('자주 뜨는 상품: 날짜·목록 조합을 세고 기간별로 나눈다', () => {
  const sibna = {
    history: [
      { date: '2026-11-07', lists: { sales: ['1', '2'] } },
      { date: '2026-11-12', lists: { sales: ['1'], premium: ['1'] } },
      { date: '2026-11-13', lists: { sales: ['1', '3'] } },
    ],
    products: { 1: { name: '자주', vsRetail: 20 }, 2: { name: '옛날' }, 3: { name: '오늘만' } },
  };
  const kreamFile = { history: [
    { at: '2026-11-13T01:00:00Z', items: { 1: [1, 1, 1] }, fresh: ['3'] },
    { at: '2026-11-13T05:00:00Z', items: { 1: [1, 1, 1] } },
  ] };
  const result = buildFrequent({ kreamFile, sibna, now: new Date('2026-11-13T06:00:00Z') });
  assert.deepEqual(result.windows[1].map((r) => [r.id, r.hits, r.days]), [['1', 2, 1], ['3', 2, 1]]);
  assert.deepEqual(result.windows[7].map((r) => [r.id, r.hits, r.days]), [['1', 5, 3], ['3', 2, 1], ['2', 1, 1]]);
  assert.deepEqual(result.windows[7][0].sources.sort(), ['sibna 거래 활발', 'sibna 프리미엄', '크림 랭킹'].sort());
  assert.equal(result.windows[3].some((r) => r.id === '2'), false);
  assert.equal(result.windows[7][0].url, 'https://kream.co.kr/products/1');
  assert.equal(buildFrequent({ kreamFile: null, sibna: null }), null);
});