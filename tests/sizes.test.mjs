import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../extension/extractor.js';
import '../extension/snapshot.js';
import { isShoe, sizeAdvice } from '../src/sizes.mjs';

const { parseRecentTrades } = globalThis.DealRadarExtractor;
const { mergeTrades } = globalThis.DealRadarSnapshot;

test('상품 페이지의 체결 거래 표를 읽는다 (실제 크림 글자)', () => {
  const text = ['옵션 선택', '체결 거래', '판매 입찰', '구매 입찰', '옵션', '거래가', '거래일',
    'XXL', '139,000원', '42분 전', 'M', '119,000원', '2시간 전', 'S', '123,000원', '4시간 전', '270', '210,000원', '26/11/10',
    '거래 내역 더보기', '이용 안내'].join('\n');
  const now = Date.parse('2026-11-13T05:30:00Z');
  const trades = parseRecentTrades(text, now);
  assert.deepEqual(trades.map((t) => [t.size, t.price]), [['XXL', 139000], ['M', 119000], ['S', 123000], ['270', 210000]]);
  assert.equal(trades[0].at, '2026-11-13T04:00:00.000Z'); // 42분 전 → 04:48 → 정시 04:00
  assert.equal(trades[1].at, '2026-11-13T03:00:00.000Z');
  assert.equal(trades[3].at, '2026-11-10T03:00:00.000Z');
  assert.deepEqual(parseRecentTrades('체결 거래 없음'), []);
});

test('거래 기록은 방문마다 쌓되 같은 거래는 한 번만, 30일·60건까지', () => {
  const now = '2026-11-13T06:00:00Z';
  const first = mergeTrades([], [{ size: '270', price: 1, at: '2026-11-13T04:00:00.000Z' }], now);
  const again = mergeTrades(first, [{ size: '270', price: 1, at: '2026-11-13T04:00:00.000Z' }, { size: '275', price: 2, at: '2026-11-13T05:00:00.000Z' }], now);
  assert.deepEqual(again, [['270', 1, '2026-11-13T04:00:00.000Z'], ['275', 2, '2026-11-13T05:00:00.000Z']]);
  assert.deepEqual(mergeTrades([['270', 1, '2026-09-01T00:00:00Z']], [], now), []);
  const many = Array.from({ length: 80 }, (_, i) => ({ size: '270', price: i, at: '2026-11-12T00:00:00Z' }));
  assert.equal(mergeTrades([], many, now).length, 60);
});

const t = (size, price, n = 1) => Array.from({ length: n }, () => [size, price, '2026-11-12T00:00:00Z']);

test('신발: 거래 사이즈로 성별 인기와 추천 사이즈를 정한다', () => {
  const men = sizeAdvice('Nike Dunk Low Black', [...t('270', 100000, 4), ...t('275', 120000, 3), ...t('280', 100000, 2), ...t('240', 90000, 1)]);
  assert.equal(men.kind, 'shoe');
  assert.equal(men.basis, 'trades');
  assert.equal(men.gender.side, 'men');
  assert.match(men.gender.text, /10건 중 90%가 260 이상/);
  assert.deepEqual(men.recommend.map((r) => r.size), ['270', '275', '280']);
  assert.deepEqual(men.pricey.map((r) => r.size), ['275']);

  const women = sizeAdvice('(W) Nike Vomero 18', [...t('235', 100000, 3), ...t('240', 100000, 3), ...t('270', 100000, 1)]);
  assert.equal(women.gender.side, 'women');
});

test('거래가 적으면 이름 표기와 일반 기준으로, 옷은 성별 없이 많이 팔린 사이즈만', () => {
  const w = sizeAdvice('(W) 나이키 코트 비전 알타 화이트', []);
  assert.equal(w.basis, 'general');
  assert.equal(w.gender.side, 'women');
  assert.deepEqual(w.recommend.map((r) => r.size), ['235', '240', '245']);
  assert.deepEqual(sizeAdvice('Union x Nike 덩크 로우', []).recommend.map((r) => r.size), ['265', '270', '275']);
  assert.equal(sizeAdvice('IAB Studio Hoodie Black', []), null); // 옷인데 거래가 없으면 안내하지 않는다
  const hoodie = sizeAdvice('IAB Studio Hoodie Black', [...t('M', 110000, 3), ...t('L', 120000, 2), ...t('XL', 100000, 1)]);
  assert.equal(hoodie.kind, 'apparel');
  assert.equal(hoodie.gender, null);
  assert.deepEqual(hoodie.recommend.map((r) => r.size), ['M', 'L']);
  assert.equal(isShoe('Spao Basic Fur Fleece Zip Up Black'), false);
});

test('상품 상세: 누적 거래 수(trades)와 거래 기록(tradeLog)을 따로 둔다', () => {
  const { mergeDetails } = globalThis.DealRadarSnapshot;
  const merged = mergeDetails(null, [{ id: '1', name: 'Nike Dunk', wish: 10, trades: 3988, at: '2026-11-13T05:00:00Z',
    recentTrades: [{ size: '270', price: 100000, at: '2026-11-13T04:00:00.000Z' }] }], '2026-11-13T05:00:00Z');
  assert.equal(merged['1'].trades, 3988);
  assert.deepEqual(merged['1'].tradeLog, [['270', 100000, '2026-11-13T04:00:00.000Z']]);
  assert.equal(merged['1'].recentTrades, undefined);
});