import test from 'node:test';
import assert from 'node:assert/strict';
import { collectShopRestock, findRestocks, kreamVerdict, shopAlerts, stockOf } from '../src/sources/shopRestock.mjs';

const product = (handle, title, avail) => ({
  handle, title, product_type: 'FOOTWEAR', images: [{ src: 'img' }],
  variants: avail.map((ok, i) => ({ id: `${handle}-${i}`, title: `M ${i + 8}`, price: '140.00', available: ok })),
});
const shop = (products) => ({ origin: 'https://skylrk.com', name: 'SKYLRK', currency: 'USD', products });
const now = new Date('2026-11-13T03:00:00Z');

test('전부 품절이던 상품이 풀리면 재입고, 처음 보는 상품은 새 상품, 일부만 바뀐 건 무시', () => {
  const before = stockOf([product('matterdaddies', 'MATTERDADDIES', [false, false]), product('hoodie', 'HOODIE', [true, false])]);
  const after = shop([
    product('matterdaddies', 'MATTERDADDIES', [true, false]),
    product('hoodie', 'HOODIE', [true, true]),
    product('glicky', 'GLICKY - GLOSS', [true]),
  ]);
  const events = findRestocks(before, after, now);
  assert.deepEqual(events.map((e) => [e.title, e.kind]), [['MATTERDADDIES', 'restock'], ['GLICKY - GLOSS', 'new']]);
  assert.deepEqual(events[0].sizes, ['M 8']);
  assert.equal(events[0].url, 'https://skylrk.com/products/matterdaddies');
  assert.deepEqual(findRestocks(undefined, after, now), [], '첫 실행은 기준만 잡는다');
});

test('크림 인기 목록에서 같은 브랜드·이름이 맞으면 추천, 웃돈 계산', () => {
  const [event] = findRestocks({ matterdaddies: [] }, shop([product('matterdaddies', 'MATTERDADDIES', [true])]), now);
  const hot = [
    { id: '1', name: 'Skylrk Hoodie Cave', price: 300000 },
    { id: '2', name: 'Skylrk Matterdaddies Ash', price: 280000, freshRank: 3 },
  ];
  const v = kreamVerdict(event, hot, { USD: 1400 });
  assert.equal(v.level, 'buy');
  assert.equal(v.kream.id, '2');
  assert.equal(v.retailKrw, 196000);
  assert.equal(v.kream.margin, 43);
  assert.equal(kreamVerdict(event, [], { USD: 1400 }).level, 'unknown');
  assert.equal(kreamVerdict(event, [hot[0]], { USD: 1400 }).level, 'check', '브랜드만 인기');
});

test('알림: 재입고는 늘, 새 상품은 크림 근거가 있을 때만, 하루 지난 건 빼기', () => {
  const base = { store: 'SKYLRK', title: 'X', url: 'u', price: 140, currency: 'USD', at: now.toISOString() };
  const alerts = shopAlerts([
    { ...base, id: 'a', kind: 'restock', verdict: { level: 'unknown' } },
    { ...base, id: 'b', kind: 'new', verdict: { level: 'unknown' } },
    { ...base, id: 'c', kind: 'new', verdict: { level: 'buy' } },
    { ...base, id: 'd', kind: 'restock', verdict: { level: 'buy' }, at: '2026-11-11T00:00:00Z' },
  ], now);
  assert.deepEqual(alerts.map((a) => a.id), ['a', 'c']);
  assert.match(alerts[0].name, /공홈 재입고 · SKYLRK X · 크림 기록 없음/);
  assert.equal(alerts[0].kind, 'kream');
});

test('가게 하나가 실패해도 그 가게 직전 재고를 유지한다', async () => {
  const previous = { stock: { 'skylrk.com': { a: [] }, 'bad.com': { b: [] } }, events: [] };
  const load = async (url) => {
    if (url.includes('bad')) throw new Error('500');
    return shop([product('a', 'A', [true])]);
  };
  const out = await collectShopRestock([{ url: 'https://skylrk.com' }, { url: 'https://bad.com' }], previous, now, load);
  assert.deepEqual(out.stock['bad.com'], { b: [] });
  assert.equal(out.events[0].kind, 'restock');
  assert.equal(out.errors.length, 1);
});
