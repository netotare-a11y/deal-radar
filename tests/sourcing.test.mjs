import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  brandOf, parseStoreLinks, recommendProducts, recommendReleases, searchLinks, searchQuery, similarProduct,
} from '../src/sourcing.mjs';

test('브랜드: 한글·영문 이름을 같은 브랜드로 본다', () => {
  assert.equal(brandOf('SNKRS 나이키 SB 에어 포스 1'), 'nike');
  assert.equal(brandOf('Nike Dunk Low'), 'nike');
  assert.equal(brandOf('the-north-face 자켓'), 'the north face');
  assert.equal(brandOf('알 수 없는 상품'), null);
});

test('검색어: 매장 표시와 발매 같은 말을 뺀다', () => {
  assert.equal(searchQuery('카시나) UNION X NIKE'), 'UNION X NIKE');
  assert.equal(searchQuery('반스 OTW 슬립온 Shadow Vibram 발매'), '반스 OTW 슬립온 Shadow Vibram');
  const links = searchLinks('카시나) UNION X NIKE', { kreamUrl: 'https://kream.co.kr/products/1' });
  assert.deepEqual(links.map((l) => l.label), ['크림', '네이버쇼핑', '무신사', '구글']);
  assert.equal(links[0].url, 'https://kream.co.kr/products/1');
  assert.ok(links[1].url.endsWith('UNION%20X%20NIKE'));
});

test('발매 글의 바로가기 칸에서 발매처 링크를 읽는다', () => {
  const html = `<section class="release-store-links" aria-label="x"><div class="release-store-links-list">
    <a class="release-store-link is-main go-btn" data-post-id="2800" href="https://sibna.kr/today/go.php?id=2800" target="_blank"><small>대표 링크</small><strong>sibna.kr</strong></a>
    <a class="release-store-link go-btn" href="https://sibna.kr/today/go.php?id=2800&amp;n=2"><small>링크</small><strong>nike.com</strong></a>
    <a class="release-store-link" href="javascript:alert(1)"><strong>bad</strong></a>
  </div></section><a class="release-store-link" href="https://other.example/">밖</a>`;
  assert.deepEqual(parseStoreLinks(html), [
    { label: '바로가기', url: 'https://sibna.kr/today/go.php?id=2800' },
    { label: 'nike.com', url: 'https://sibna.kr/today/go.php?id=2800&n=2' },
  ]);
  assert.deepEqual(parseStoreLinks('<html></html>'), []);
});

const hot = [
  { id: '1', name: '조던 1 x 트래비스 스캇 레트로 로우 카나리', brand: 'jordan', premium: 90, hits: 5, days: 3, sibnaNew: true },
  { id: '2', name: 'Nike Dunk Low Black', premium: 20, freshRank: 2, hits: 3, days: 2, wishDelta: 400 },
  { id: '3', name: '푸마 팔레르모', brand: 'puma', premium: -50, sibnaNew: true },
  { id: '4', name: '오래된 인기 상품', premium: 100, hits: 6, days: 7 },
];

test('신상품 추천: 신상만, 정가보다 크게 싼 것은 빼고 점수 순', () => {
  const recs = recommendProducts(hot, new Date('2026-11-13T00:00:00Z'));
  assert.deepEqual(recs.map((r) => r.id), ['1', '2']);
  assert.ok(recs[0].reasons.includes('정가 대비 +90%'));
  assert.ok(recs[1].reasons.includes('관심 +400'));
  assert.equal(recs[0].links[0].url, 'https://kream.co.kr/products/1');
});

test('발매 예정 추천: 지난 발매는 빼고 뜨는 브랜드·비슷한 상품으로 점수를 준다', () => {
  const now = new Date('2026-11-13T03:00:00Z'); // KST 12:00
  const releases = [
    { id: 'a', title: '조던 1 트래비스 스캇 로우 카나리 발매', date: '2026-11-14', time: '10:00', method: '응모', url: 'https://sibna.kr/today/post/a', watched: true },
    { id: 'b', title: '나이키 덩크 지난 발매', date: '2026-11-13', time: '10:00', url: 'https://sibna.kr/today/post/b' },
    { id: 'c', title: '알 수 없는 브랜드 팝업', date: '2026-11-15', time: '', url: 'https://sibna.kr/today/post/c' },
  ];
  const recs = recommendReleases(releases, hot, now);
  assert.deepEqual(recs.map((r) => r.id), ['a']);
  assert.equal(recs[0].similar.url, 'https://kream.co.kr/products/1');
  assert.ok(recs[0].reasons.some((r) => r.startsWith('요즘 뜨는 브랜드 (jordan')));
  assert.ok(recs[0].reasons.includes('응모(한정 수량)'));
  assert.equal(similarProduct('완전히 다른 이름', hot), null);
});

import { attachRestock, findRestock, recommendBudget, whereToBuy } from '../src/sourcing.mjs';

test('저단가 회전: 6만 원 이하, 자주 뜨고 거래가 많은 순, 정가보다 40% 넘게 싼 것은 뺀다', () => {
  const items = [
    { id: 's', name: 'Spao Basic Fur Fleece Zip Up Black', price: 21000, trades: 4437, kreamRank: 23 },
    { id: 'n', name: 'Nike Stride Top', price: 58000, trades: 13000, kreamRank: 38, hits: 2, days: 1 },
    { id: 'x', name: '비싼 자켓', price: 250000, trades: 9000, kreamRank: 1 },
    { id: 'c', name: '너무 싼 신발', price: 30000, trades: 9000, premium: -45 },
    { id: 'z', name: '조용한 상품', price: 10000 },
  ];
  const recs = recommendBudget(items, { maxPrice: 60000 });
  assert.deepEqual(recs.map((r) => r.id), ['n', 's']);
  assert.ok(recs[1].reasons.includes('누적 거래 4,437'));
  assert.deepEqual(recs[1].where.map((w) => w.label), ['공식몰', '매장 찾기', '재입고 소식', '번개장터']);
  assert.equal(recs[1].where[0].url, 'https://spao.com/product/search.html?keyword=Spao%20Basic%20Fur%20Fleece%20Zip%20Up%20Black');
});

test('구할 곳: 공식몰을 모르는 브랜드는 지도·검색만, 브랜드를 모르면 검색만', () => {
  assert.deepEqual(whereToBuy('Salomon XT-6', 'salomon').map((w) => w.label), ['매장 찾기', '재입고 소식', '번개장터']);
  assert.ok(whereToBuy('Salomon XT-6', 'salomon')[0].url.startsWith('https://map.naver.com/p/search/'));
  assert.deepEqual(whereToBuy('이름 모를 상품', null).map((w) => w.label), ['재입고 소식', '번개장터']);
});

test('리스탁: 같은 브랜드의 재입고·재발매 글과 모델명이 겹치면 붙인다', () => {
  const releases = [
    { title: '스파오 퍼 플리스 집업 재입고', date: '2026-11-20', time: '10:00', url: 'https://sibna.kr/today/post/1' },
    { title: '나이키 덩크 로우 재발매', date: '2026-11-21', url: 'https://sibna.kr/today/post/2' },
    { title: '스파오 신상 발매', date: '2026-11-22', url: 'https://sibna.kr/today/post/3' },
  ];
  assert.equal(findRestock('스파오 퍼 플리스 집업 블랙', releases)?.url, 'https://sibna.kr/today/post/1');
  assert.equal(findRestock('Nike Dunk Low Black', releases), null); // 영문·한글 모델명은 짝짓지 않는다
  assert.equal(findRestock('아디다스 삼바', releases), null);
  const [item] = attachRestock([{ name: '나이키 덩크 로우 블랙' }], releases);
  assert.equal(item.restock.date, '2026-11-21');
});