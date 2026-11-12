// 신발 성별 인기·추천 사이즈. 확장이 쌓은 크림 체결 거래([사이즈, 가격, 시각])로 계산하고,
// 거래가 적으면 이름 표기((W), (GS))와 일반 기준으로 안내한다.

const MIN_TRADES = 5;
const SHOE_WORDS = /덩크|조던|jordan|dunk|에어\s*포스|air\s*force|air\s*max|에어\s*맥스|스니커즈|운동화|러닝화|슬립온|slip-on|부츠|boots?\b|샌들|슬리퍼|slipper|뮬|클로그|clog|new\s*balance\s*\d|뉴발란스\s*\d|\b(990|991|992|993|530|550|2002r|1906r|9060|327)\b|삼바|samba|가젤|gazelle|스페지알|spezial|오니츠카|onitsuka|xt-6|\bkd\s*\d|lebron|르브론|컨버스|converse|척\s*70|chuck|vans|반스|crocs|크록스|ugg|어그|tasman|타스만|mind\s*001|vomero|보메로|pegasus|페가수스|novablast|노바블라스트|gel-|kayano|카야노|코트\s*비전|court\s*vision|킬샷|killshot|ld-1000|코르테즈|cortez|블레이저|blazer|에어\s*줌|air\s*zoom|러너|runner|트레이너|trainer|스니커|로퍼|loafer|더비|derby|아디제로|adizero|도쿄|tokyo|토바코|campus|캠퍼스|포럼|forum|스탠스미스|stan\s*smith|슈퍼스타|superstar|에어\s*리프트|휴먼레이스/i;

const shoeMm = (size) => {
  const n = Number(String(size).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 200 && n <= 330 && /^\d{3}(\.\d)?$/.test(String(size).trim()) ? n : null;
};

export const isShoe = (name, trades = []) => {
  const mm = (Array.isArray(trades) ? trades : []).map(([size]) => shoeMm(size)).filter(Boolean);
  if (trades.length && mm.length / trades.length >= 0.6) return true;
  return !trades.length && SHOE_WORDS.test(String(name ?? ''));
};

const label = (name) => (/\(W\)|wmns|우먼스|women/i.test(name) ? 'women'
  : /\((GS|PS|TD)\)|키즈|kids/i.test(name) ? 'kids' : null);

const GENERAL = {
  women: { sizes: ['235', '240', '245'], text: '여성용 표기(W) 상품이에요. 여성 사이즈 235~245가 보통 가장 많이 거래돼요.' },
  kids: { sizes: ['225', '230', '235'], text: '키즈(GS) 표기 상품이에요. 큰 사이즈(225~240)는 성인 여성도 신어서 수요가 있어요.' },
  men: { sizes: ['265', '270', '275'], text: '남녀 공용 사이즈 상품은 보통 남성 사이즈 265~280이 가장 많이 거래돼요.' },
};

/**
 * 성별 인기와 추천 사이즈.
 * - 거래 5건 이상: 245 이하를 여성, 260 이상을 남성 수요로 보고 비율로 판단한다.
 *   추천 사이즈는 많이 거래된 순서이고, 평균보다 3% 이상 비싸게 팔린 사이즈를 표시한다.
 * - 그보다 적으면 이름 표기와 일반 기준(basis: 'general')으로 안내한다.
 */
export function sizeAdvice(name, trades = []) {
  const list = Array.isArray(trades) ? trades : [];
  if (!isShoe(name, list)) {
    if (list.length < MIN_TRADES) return null;
    return { kind: 'apparel', basis: 'trades', n: list.length, gender: null, ...topSizes(list) };
  }
  const tag = label(name);
  const mm = list.map(([size, price]) => ({ mm: shoeMm(size), price })).filter((t) => t.mm);
  if (mm.length < MIN_TRADES) {
    const g = GENERAL[tag ?? 'men'];
    return {
      kind: 'shoe', basis: 'general', n: mm.length,
      gender: tag === 'women' ? { side: 'women', text: '여성에게 인기일 가능성이 높아요 (여성용 표기).' } : null,
      recommend: g.sizes.map((size) => ({ size, n: 0, vsAvg: null })),
      note: `${g.text} 거래 기록이 ${mm.length}건뿐이라 일반 기준으로 안내해요.`,
    };
  }
  const women = mm.filter((t) => t.mm <= 245).length / mm.length;
  const men = mm.filter((t) => t.mm >= 260).length / mm.length;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const gender = women >= 0.6 ? { side: 'women', text: `여성에게 인기예요. 최근 거래 ${mm.length}건 중 ${pct(women)}가 245 이하예요.` }
    : men >= 0.6 ? { side: 'men', text: `남성에게 인기예요. 최근 거래 ${mm.length}건 중 ${pct(men)}가 260 이상이에요.` }
      : { side: 'both', text: `남녀 고루 거래돼요. 245 이하 ${pct(women)}, 260 이상 ${pct(men)}예요.` };
  return { kind: 'shoe', basis: 'trades', n: mm.length, gender, ...topSizes(list) };
}

function topSizes(list) {
  const avg = list.reduce((s, [, price]) => s + price, 0) / list.length;
  const by = new Map();
  for (const [size, price] of list) {
    const b = by.get(size) ?? { size: String(size), n: 0, sum: 0 };
    b.n += 1;
    b.sum += price;
    by.set(size, b);
  }
  const rows = [...by.values()].map((b) => ({ size: b.size, n: b.n, vsAvg: Math.round(((b.sum / b.n) / avg - 1) * 1000) / 10 }));
  const recommend = rows.filter((r) => r.n >= 2).sort((a, b) => b.n - a.n || b.vsAvg - a.vsAvg).slice(0, 3);
  const pricey = rows.filter((r) => r.n >= 2 && r.vsAvg >= 3).sort((a, b) => b.vsAvg - a.vsAvg).slice(0, 2);
  return {
    recommend: recommend.length ? recommend : rows.sort((a, b) => b.n - a.n).slice(0, 3),
    pricey,
    note: '많이 거래된 사이즈일수록 빨리 팔려요. 평균보다 비싸게 팔린 사이즈는 웃돈을 노리기 좋아요.',
  };
}
