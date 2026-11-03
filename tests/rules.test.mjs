import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDealAlertable, isReleaseAlertable } from '../src/notify/rules.mjs';

const config = {
  watchKeywords: ['조던'],
  notify: { releases: 'all', dealMinRecommend: 10, dealOnBest: true },
};
const noon = new Date('2026-11-03T03:00:00Z'); // KST 12:00

test('이미 시작했거나 지난 발매는 알리지 않는다 (KST 기준)', () => {
  const at = (date, time) => isReleaseAlertable({ title: 'x', date, time }, config, noon);
  assert.equal(at('2026-11-03', '18:00'), true);
  assert.equal(at('2026-11-03', '10:00'), false);
  assert.equal(at('2026-11-02', '18:00'), false);
  assert.equal(at('2026-11-03', ''), true);
  assert.equal(at('2026-11-04', '10:00'), true);
});

test('발매 알림을 관심 키워드로 좁힐 수 있다', () => {
  const only = { ...config, notify: { ...config.notify, releases: 'watch' } };
  assert.equal(isReleaseAlertable({ title: '일반', date: '2026-11-04', time: '' }, only, noon), false);
  assert.equal(isReleaseAlertable({ title: '에어 조던', date: '2026-11-04', time: '' }, only, noon), true);
});

test('핫딜은 BEST, 추천수, 관심 키워드 중 하나를 만족해야 알린다', () => {
  const deal = (over) => ({ title: '일반', recommend: 0, best: false, ...over });
  assert.equal(isDealAlertable(deal(), config), false);
  assert.equal(isDealAlertable(deal({ recommend: 9 }), config), false);
  assert.equal(isDealAlertable(deal({ recommend: 10 }), config), true);
  assert.equal(isDealAlertable(deal({ best: true }), config), true);
  assert.equal(isDealAlertable(deal({ title: '에어 조던 특가' }), config), true);
});
