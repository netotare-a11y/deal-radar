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
