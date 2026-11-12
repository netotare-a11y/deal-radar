import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachNaverRestock, relevant, restockQuery } from '../src/sources/naverRestock.mjs';

test('검색어: 영문 크림 이름을 한글 브랜드·옷 종류로 바꾸고 색은 뺀다', () => {
  assert.equal(restockQuery('Spao Basic Fur Fleece Zip Up Black').query, '스파오 베이직 퍼 플리스 집업 재입고');
  assert.equal(restockQuery('Spao Thin-Light Hooded Jacket Light Gray').query, '스파오 씬라이트 후드 자켓 재입고');
});

test('제목에 재입고·브랜드·모델명이 있어야 하고, 흔한 낱말·색 이름만 겹치면 뺀다', () => {
  const spao = restockQuery('Spao Thin-Light Hooded Jacket Black');
  const post = (title) => ({ title, summary: '' });
  assert.equal(relevant(post('스파오 씬라이트 후드자켓 패딩 재입고 일정 및 매장 총정리'), spao), true);
  assert.equal(relevant(post('스파오 후드 자켓 재입고'), spao), false); // 모델명(씬라이트) 없음
  assert.equal(relevant(post('씬라이트 자켓 재입고'), spao), false); // 브랜드 없음
  assert.equal(relevant(post('스파오 씬라이트 자켓 팝니다 재입고가'), spao), false); // 중고 거래
  const killshot = restockQuery('(W) 나이키 킬샷 2 세일 미드나잇 네이비');
  assert.equal(relevant(post('나이키 온라인 재입고 보르도/미드나잇/로투스'), killshot), false);
  const cap = restockQuery('피스마이너스원 x 맥도날드 빈티지 캡');
  assert.equal(relevant(post('지드래곤 맥도날드 굿즈, 재판매 가격'), cap), false);
});

test('6시간 안에 찾아 본 상품은 다시 묻지 않고, 키가 거절되면 멈춘다', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ items: [{ title: '스파오 <b>씬라이트</b> 자켓 재입고 소식', link: 'https://blog.naver.com/a/1', postdate: '20261112', description: '' }] }) };
  };
  const now = new Date('2026-11-13T00:00:00Z');
  const items = [{ id: '1', name: 'Spao Thin-Light Hooded Jacket Black' }, { id: '2', name: 'Spao Basic Fur Fleece Zip Up Black' }];
  const cache = { 2: { at: '2026-11-12T22:00:00Z', posts: [] } };
  const next = await attachNaverRestock(items, cache, { id: 'i', secret: 's' }, { fetchImpl, now });
  assert.equal(calls, 2); // 1번 상품만 블로그·카페 두 번
  assert.equal(items[0].naverRestock[0].title, '스파오 씬라이트 자켓 재입고 소식');
  assert.equal(items[0].naverRestock[0].date, '2026-11-12');
  assert.deepEqual(Object.keys(next).sort(), ['1', '2']);

  const denied = async () => ({ ok: false, status: 401 });
  await assert.rejects(attachNaverRestock([{ id: '3', name: '스파오 플리스' }], {}, { id: 'i', secret: 's' }, { fetchImpl: denied, now }), /거절/);
});
