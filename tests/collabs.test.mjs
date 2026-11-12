import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collabInfo, findCollabs } from '../src/collabs.mjs';

test('협업 상대 찾기: 협업 표시가 있을 때만, 영문은 낱말 단위로', () => {
  assert.deepEqual(findCollabs('덩크 로우 x Union').map((c) => c.key), ['union']);
  assert.deepEqual(findCollabs('Supreme x Timberland Polartec Jacket').map((c) => c.key), ['supreme', 'timberland', 'polartec']);
  assert.deepEqual(findCollabs('카시나) UNION X NIKE').map((c) => c.key), ['union']);
  assert.deepEqual(findCollabs('Union Apparel 단독 발매'), []); // 협업 표시 없음
  assert.deepEqual(findCollabs('Nike x Reunion Pack'), []); // 'reunion' 안의 union 은 아님
});

test('협업 설명에 지금 시장 근거를 붙이고, 확인된 웃돈만 평균 낸다', () => {
  const hot = [
    { name: 'Supreme x Timberland Jacket', premium: 127, premiumSource: 'kream' },
    { name: 'Supreme Beanie', premium: 31, premiumSource: 'kream' },
    { name: 'Supreme Tee', premium: 900, premiumSource: 'sibna' },
    { name: 'Nike Dunk', premium: 10, premiumSource: 'kream' },
  ];
  const [supreme] = collabInfo('Supreme x Timberland', hot);
  assert.equal(supreme.label, 'Supreme (슈프림)');
  assert.ok(supreme.about.length > 10 && supreme.why.length > 0);
  assert.equal(supreme.market, '지금 크림·sibna에 Supreme 관련 상품이 3개 떠 있어요. 크림 발매가로 확인한 2개의 평균 웃돈은 +79%예요. (최고: Supreme x Timberland Jacket +127%)');
  assert.equal(collabInfo('덩크 로우 x Union', hot)[0].market, '');
});
test('예전 협업은 크림 검색, 지금 뜬 같은 협업 상품은 상품 페이지로 연결한다', () => {
  const [union] = collabInfo('덩크 로우 x Union', [{ id: '1159', name: 'Jordan 4 Retro x Union Off Noir', premium: 40, premiumSource: 'kream' }]);
  assert.deepEqual(union.links.map((l) => l.label), ["크림 'Union' 전체", 'Jordan 1 Union', 'Jordan 4 Union', 'Jordan 2 Union', 'Dunk Low Union']);
  assert.equal(union.links[2].url, 'https://kream.co.kr/search?keyword=Jordan%204%20Union');
  assert.deepEqual(union.current, [{ label: 'Jordan 4 Retro x Union Off Noir', url: 'https://kream.co.kr/products/1159' }]);
  const [vaquera] = collabInfo('Supreme x Vaquera', []).filter((c) => c.key === 'vaquera');
  assert.deepEqual(vaquera.links.map((l) => l.label), ["크림 'Vaquera' 전체"]); // 대표 협업을 모르면 전체 검색만
});