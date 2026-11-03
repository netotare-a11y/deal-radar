import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstImage, parseRss } from '../src/lib/rss.mjs';
import { mergeDeals, parseBoardList, parseDealTitle } from '../src/sources/ruliweb.mjs';
import { parseNews, parseReleaseItem } from '../src/sources/sibna.mjs';

const RSS = `<rss><channel>
<item><title><![CDATA[나이키 덩크 & 조던]]></title><link>https://sibna.kr/today/post/1-x</link>
<guid isPermaLink="false">today-release-2574</guid>
<description><![CDATA[<p><img src="https://sibna.kr/a.jpg"></p><p>발매일 2026-11-04 · 발매시간 10:00 · 진행방식 선착순</p>]]></description>
<category><![CDATA[선착순]]></category><pubDate>Tue, 03 Nov 2026 17:30:25 +0900</pubDate>
<enclosure url="https://sibna.kr/a.jpg" type="image/jpeg" /></item>
<item><title>A &amp; B</title><link>https://bbs.ruliweb.com/market/board/1020/read/9</link><description></description></item>
</channel></rss>`;

test('RSS: CDATA와 엔티티를 모두 해석한다', () => {
  const items = parseRss(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, '나이키 덩크 & 조던');
  assert.equal(items[0].enclosure, 'https://sibna.kr/a.jpg');
  assert.equal(items[1].title, 'A & B');
  assert.equal(firstImage(items[0].description), 'https://sibna.kr/a.jpg');
});

test('sibna: 발매일·시간·방식을 뽑는다', () => {
  const release = parseReleaseItem(parseRss(RSS)[0]);
  assert.equal(release.id, 'sibna:2574');
  assert.equal(release.date, '2026-11-04');
  assert.equal(release.time, '10:00');
  assert.equal(release.method, '선착순');
});

test('sibna: 시간이 없는 항목도 처리한다', () => {
  const release = parseReleaseItem({
    guid: 'today-release-7', title: 'x', link: 'https://sibna.kr/x', enclosure: '', category: '응모',
    description: '<p>발매일 2026-12-25 · 진행방식 응모.</p>', pubDate: '',
  });
  assert.equal(release.time, '');
  assert.equal(release.method, '응모');
});

test('sibna: 날짜 없는 항목과 http 이미지는 걸러진다', () => {
  assert.equal(parseReleaseItem({ guid: 'x-1', title: 't', description: '내용', link: '', enclosure: '', category: '', pubDate: '' }), null);
  const release = parseReleaseItem({
    guid: 'r-1', title: 't', link: 'javascript:alert(1)', enclosure: 'http://evil/a.jpg', category: '',
    description: '발매일 2026-12-25', pubDate: '',
  });
  assert.equal(release.url, null);
  assert.equal(release.image, null);
});

test('sibna: 뉴스 대표글과 목록을 읽는다', () => {
  const html = `<a class="tdh-news-lead" href="https://sibna.kr/today/news/20261103#n1" data-news-i="0">
    <span class="tdh-news-sec">오늘 꼭 볼 것 · 11.03</span><strong>대표 제목</strong><p>요약</p></a>
    <ul class="tdh-news-list"><li><a href="https://sibna.kr/today/news/20261103#n2" data-news-i="1"><span>스니커즈</span>둘째 제목</a></li></ul>`;
  const news = parseNews(html);
  assert.deepEqual(news.map((n) => n.title), ['대표 제목', '둘째 제목']);
  assert.equal(news[0].section, '오늘 꼭 볼 것');
  assert.equal(news[1].section, '스니커즈');
});

test('루리웹: 제목에서 판매처·가격을 분리한다', () => {
  assert.deepEqual(parseDealTitle('[소프라노] 스위치 하늘의궤적 1st (69,800/3,000)'),
    { store: '소프라노', name: '스위치 하늘의궤적 1st (69,800/3,000)', price: '69,800원' });
  assert.equal(parseDealTitle('[알리] 유그린 45W 어댑터(22.06달러)').price, '$22.06');
  assert.equal(parseDealTitle('[지마켓] PS5 GTA 6 체감가 78846원').price, '78,846원');
  assert.equal(parseDealTitle('[롯데온] 상품 안내').price, '');
});

const row = (cls, id, cat, title, reply, rec, hit, time) => `<tr class="table_body ${cls}">
  <td class="id">${id}</td><td class="divsn"><a href="#"><strong>${cat}</strong></a></td>
  <td class="subject"><a class="subject_link deco" href="https://bbs.ruliweb.com/market/board/1020/read/${id}?"><strong>${title}</strong>
  <a class="num_reply" href="#cmt"> (${reply})</a></a></td>
  <td class="writer text_over">x</td><td class="recomd">${rec}</td><td class="hit">${hit}</td><td class="time">${time}</td></tr>`;

test('루리웹 목록: 공지를 빼고 BEST와 추천수를 읽는다', () => {
  const html = row('notice inside', '1', '상품권', '공지', 1, 2, 3, '2026.10.31')
    + row('best inside blocktarget', '2', 'BEST', '[지마켓] 베스트', 42, 13, 26682, '13:13')
    + row('inside', '2', '게임', '[지마켓] 베스트', 42, 13, 26682, '13:13')
    + row('inside', '3', '생활', '[쿠팡] 일반', 0, 0, 10, '2026.11.01');
  const deals = parseBoardList(html, new Date('2026-11-03T10:00:00Z'));
  assert.equal(deals.length, 2);
  const best = deals.find((d) => d.id === '2');
  assert.equal(best.best, true);
  assert.equal(best.category, '게임');
  assert.equal(best.recommend, 13);
  assert.equal(best.replies, 42);
  assert.equal(best.postedAt, '2026-11-03T04:13:00.000Z');
});

test('mergeDeals: RSS 이미지와 목록 추천수를 합친다', () => {
  const merged = mergeDeals(
    [{ title: '[A] 상품 10,000원', link: 'https://bbs.ruliweb.com/market/board/1020/read/5', category: '기타', pubDate: 'Tue, 03 Nov 2026 18:00:00 +0900', description: '<img src="https://i1.ruliweb.com/a.webp">' }],
    [{ id: '5', title: '[A] 상품 10,000원', category: '', best: true, recommend: 7, hits: 9, replies: 1, postedAt: null }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'ruliweb:5');
  assert.equal(merged[0].recommend, 7);
  assert.equal(merged[0].best, true);
  assert.equal(merged[0].image, 'https://i1.ruliweb.com/a.webp');
  assert.equal(merged[0].price, '10,000원');
});
