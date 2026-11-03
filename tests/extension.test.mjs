import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../extension/extractor.js';

const { detectSite, parseCount, parseCardLines } = globalThis.DealRadarExtractor;
const at = (url) => new URL(url);

test('지정한 두 페이지에서만 동작한다', () => {
  assert.equal(detectSite(at('https://kream.co.kr/?tab=home_ranking_v2')), 'kream');
  assert.equal(detectSite(at('https://kream.co.kr/?tab=home')), null);
  assert.equal(detectSite(at('https://kream.co.kr/my/selling')), null);
  assert.equal(detectSite(at('https://www.musinsa.com/main/musinsa/recommend?gf=A')), 'musinsa');
  assert.equal(detectSite(at('https://www.musinsa.com/main/musinsa/sale')), null);
});

test('만·천 단위 수치를 읽는다', () => {
  assert.equal(parseCount('1,234'), 1234);
  assert.equal(parseCount('1.2만'), 12000);
  assert.equal(parseCount('3천'), 3000);
  assert.equal(parseCount('없음'), null);
});

test('라벨이 있는 수치만 뽑고 라벨 없는 숫자는 추측하지 않는다', () => {
  const parsed = parseCardLines(['1', '나이키 덩크', '129,000원', '관심 1.2만', '거래 3,456', '987']);
  assert.equal(parsed.price, 129000);
  assert.deepEqual(parsed.counts, { 관심: 12000, 거래: 3456 });
});
