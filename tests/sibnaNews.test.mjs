import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNewsArticle, pickNews, readEvidence } from '../src/sources/sibnaNews.mjs';

const article = `<div id="resellNewsBody" class="resell-news-body"><h1>오늘 소식</h1>
<h2>🔥 오늘 꼭 볼 것</h2><h3 id="n1">Union x Nike 덩크 로우, 국내 SNKRS 응모</h3><p>Union x Nike 덩크 로우가 오전 10시 국내 SNKRS에서 응모 방식으로 발매됩니다. 국내 가격은 169,000원입니다.</p>
<h2>👟 스니커즈·발매</h2><h3 id="n5">Union x Nike 덩크 로우, 국내 가격 169,000원</h3><p>국내 SNKRS 응모는 오전 10시에 시작됩니다.</p>
<h3 id="n6">Nike x Union 의류 컬렉션 동시 발매</h3><p>Nike x Union 의류는 오전 10시 국내 SNKRS에서 선착순으로 판매됩니다. 신발 응모와 의류 선착순 판매는 별도 절차입니다.</p>
<h3 id="n8">컨버스 1908 PINNACLE</h3><p>컨버스 1908 PINNACLE이 오전 9시 30분에 선착순 판매됩니다. 가격은 확인되지 않았습니다.</p>
<h2>🇰🇷 국내 발매·응모</h2><h3 id="n20">진행 중｜W컨셉·SSF 블랙프라이데이</h3><p>할인 행사가 진행됩니다.</p>
<h2>🔥 KREAM 거래 동향</h2><h3 id="n30">에어포스 1 로우 화이트, 대량 거래와 정가 이하 가격</h3><p>발매가보다 약 34.2% 낮습니다.</p>
<h2>🌎 해외 거래 동향</h2><h3 id="n31">Union x Nike 덩크, 선발매 물량은 정가 웃돌아</h3><p>정가와 비교하면 최저 호가는 약 56.3%, 최근 평균은 약 28.9% 높습니다.</p>
</div>`;

test('발매뉴스: 분야·항목·설명으로 나눈다', () => {
  const items = parseNewsArticle(article);
  assert.equal(items.length, 7);
  assert.deepEqual(items[0], { section: '오늘 꼭 볼 것', id: 'n1', title: 'Union x Nike 덩크 로우, 국내 SNKRS 응모', text: items[0].text });
  assert.equal(items[4].section, '국내 발매·응모');
  assert.deepEqual(parseNewsArticle('<html></html>'), []);
});

test('근거 글에서 웃돈 %와 정가 이하를 읽는다', () => {
  const items = parseNewsArticle(article);
  assert.equal(readEvidence(items.find((i) => i.id === 'n31')).premium, 56.3);
  assert.equal(readEvidence(items.find((i) => i.id === 'n30')).below, true);
});

test('알짜 픽: 같은 상품은 합치고, 웃돈·응모·협업 근거로 고르며 행사·근거 없는 상품은 뺀다', () => {
  const picks = pickNews(parseNewsArticle(article), {
    url: 'https://sibna.kr/today/news/20261113',
    hot: [1, 2, 3, 4].map((n) => ({ id: String(n), name: `Nike Dunk Low ${n}`, premium: 20, premiumSource: 'kream' })),
    releases: [{ id: 'sibna:2750', title: 'SNKRS 덩크 로우 x Union Off Noir', date: '2026-11-13', time: '10:00', method: '응모', url: 'https://sibna.kr/today/post/2750' }],
  });
  assert.deepEqual(picks.map((p) => p.name), ['Union x Nike 덩크 로우, 국내 SNKRS 응모', 'Nike x Union 의류 컬렉션 동시 발매']);
  const [dunk, apparel] = picks;
  assert.ok(dunk.reasons.some((r) => r.includes("'오늘 꼭 볼 것'")));
  assert.ok(dunk.reasons.some((r) => r.includes('약 56.3% 높게')));
  assert.ok(dunk.reasons.includes('국내 가격은 169,000원이에요.'));
  assert.equal(dunk.newsUrl, 'https://sibna.kr/today/news/20261113#n1');
  assert.equal(dunk.postUrl, 'https://sibna.kr/today/post/2750');
  assert.equal(apparel.method, '선착순'); // 첫 문장 기준. '신발 응모'에 속지 않는다.
  assert.ok(!apparel.reasons.some((r) => r.includes('웃게') || r.includes('56.3')));
});