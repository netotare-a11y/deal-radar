import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../extension/extractor.js';
import '../extension/snapshot.js';
import { buildKreamTrend, buildMusinsaTrend, pickBaseline } from '../src/trends.mjs';

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
