// 협업 상대 설명. 확실히 알려진 사실만 쓰고, 시세는 실제 데이터(지금 크림·sibna)로 따로 붙인다.
// names: 제목에서 찾을 이름(영문은 낱말 단위, 한글은 포함 여부).
export const COLLABS = [
  { key: 'union', label: 'Union (유니온)', names: ['union', '유니온'],
    about: '1989년 뉴욕에서 시작해 LA에 자리 잡은 스트리트웨어 편집숍입니다. 나이키·조던과 꾸준히 협업해 온 곳으로 유명합니다.',
    why: ['조던 1·조던 4 등 이전 협업이 출시 뒤 대체로 정가보다 비싸게 거래됐어요.', '빈티지 느낌의 색 조합과 지그재그 스티치 같은 디테일로 수집 수요가 꾸준해요.', '협업 물량이 많지 않고 응모로 풀리는 경우가 많아요.'] },
  { key: 'travis', label: 'Travis Scott (트래비스 스캇)', names: ['travis scott', 'cactus jack', '트래비스 스캇', '트래비스'],
    about: '미국 래퍼이자 Cactus Jack 레이블 대표입니다. 거꾸로 된 스우시로 알려진 조던·나이키 협업을 이어 왔습니다.',
    why: ['스니커즈 협업 중 리셀 웃돈이 큰 편으로 손꼽혀요.', '대부분 응모·한정 수량이라 당첨 자체가 어렵습니다.'] },
  { key: 'supreme', label: 'Supreme (슈프림)', names: ['supreme', '슈프림'],
    about: '1994년 뉴욕에서 시작한 스케이트 브랜드입니다. 매주 소량을 드롭하는 방식과 박스 로고로 유명합니다.',
    why: ['협업 상품은 시즌마다 소량만 나와 금방 품절되는 경우가 많아요.', '인기 품목은 사이즈·색에 따라 웃돈 차이가 커서 고르는 눈이 중요해요.'] },
  { key: 'stussy', label: 'Stüssy (스투시)', names: ['stussy', 'stüssy', '스투시'],
    about: '1980년대 캘리포니아에서 서핑 문화로 시작한 스트리트웨어의 원조 격 브랜드입니다.',
    why: ['나이키 등과의 협업이 꾸준히 인기를 얻어 왔어요.', '지역별(한국·미국·유럽) 드롭이 따로 열려 기회가 여러 번 있어요.'] },
  { key: 'palace', label: 'Palace (팔라스)', names: ['palace', '팔라스'],
    about: '2009년 런던에서 시작한 스케이트 브랜드입니다. 영국 특유의 유머 있는 그래픽이 특징입니다.',
    why: ['주간 드롭이라 인기 품목은 빠르게 품절돼요.', '아디다스 등 스포츠 브랜드 협업이 주목받는 편이에요.'] },
  { key: 'kith', label: 'Kith (키스)', names: ['kith'],
    about: '2011년 로니 피그가 뉴욕에서 연 편집숍이자 브랜드입니다. 뉴발란스·아식스 등과 협업이 많습니다.',
    why: ['색 조합을 잘 다듬은 협업이 많아 꾸준히 찾는 사람이 있어요.', '시즌 캡슐(예: 뉴욕 닉스)처럼 팬층이 겹치는 협업은 수요가 더 붙어요.'] },
  { key: 'fragment', label: 'fragment design (프라그먼트)', names: ['fragment', '프라그먼트'],
    about: '일본 스트리트 문화의 대부로 불리는 후지와라 히로시의 디자인 레이블입니다.',
    why: ['절제된 디자인과 번개 로고로 수집가 선호도가 높아요.', '협업 수가 적고, 다른 협업과 겹치면(삼자 협업) 화제성이 커요.'] },
  { key: 'sacai', label: 'sacai (사카이)', names: ['sacai', '사카이'],
    about: '아베 치토세가 이끄는 일본 디자이너 브랜드입니다. 서로 다른 요소를 겹쳐 붙이는 디자인이 특징입니다.',
    why: ['나이키 협업(LDWaffle 등)으로 디자이너 협업 붐을 이끈 곳이에요.', '독특한 실루엣이라 재발매가 적고 소장 가치가 있어요.'] },
  { key: 'offwhite', label: 'Off-White (오프화이트)', names: ['off-white', 'off white', '오프화이트'],
    about: '고 버질 아블로가 만든 브랜드입니다. 나이키와의 "The Ten" 협업으로 유명합니다.',
    why: ['상징성이 커서 지난 협업도 오랫동안 웃돈이 유지되는 편이에요.'] },
  { key: 'amm', label: 'A Ma Maniére (아마마니에르)', names: ['a ma maniere', 'a ma maniére', '아마마니에르'],
    about: '미국 애틀랜타의 편집숍입니다. 조던 협업으로 잘 알려져 있습니다.',
    why: ['고급 소재와 차분한 색 조합으로 조던 협업 중 인기가 높은 편이에요.'] },
  { key: 'cdg', label: 'Comme des Garçons (꼼데가르송)', names: ['comme des garcons', 'comme des garçons', 'cdg', '꼼데가르송', '꼼데'],
    about: '레이 카와쿠보의 일본 디자이너 브랜드입니다. 나이키·컨버스 등과 협업해 왔습니다.',
    why: ['디자이너 브랜드라 패션 수요가 있고, 라인에 따라 꾸준히 팔려요.'] },
  { key: 'carhartt', label: 'Carhartt WIP (칼하트 WIP)', names: ['carhartt', '칼하트', '카하트'],
    about: '미국 워크웨어 브랜드 칼하트의 유럽 스트리트 라인입니다.',
    why: ['워크웨어 소재를 쓴 협업은 실착 수요가 많아 거래가 꾸준해요.'] },
  { key: 'timberland', label: 'Timberland (팀버랜드)', names: ['timberland', '팀버랜드'],
    about: '노란 6인치 방수 부츠로 유명한 미국 아웃도어 브랜드입니다.',
    why: ['겨울 시즌 수요가 몰리는 시기에 협업이 나와 실착·리셀 수요가 겹쳐요.'] },
  { key: 'danner', label: 'Danner (대너)', names: ['danner', '대너'],
    about: '1932년 미국 오리건에서 시작한 아웃도어 부츠 브랜드입니다.',
    why: ['튼튼한 부츠라 실착 수요가 있고, 스트리트 브랜드 협업은 물량이 적어요.'] },
  { key: 'thisisneverthat', label: 'thisisneverthat (디스이즈네버댓)', names: ['thisisneverthat', '디스이즈네버댓'],
    about: '2010년 서울에서 시작한 스트리트 브랜드입니다.',
    why: ['국내 팬층이 두텁고, 해외 브랜드 협업은 화제성이 커요.'] },
  { key: 'nhoolywood', label: 'N.HOOLYWOOD (엔할리우드)', names: ['n.hoolywood', 'nhoolywood', '엔할리우드'],
    about: '일본 디자이너 오구치 다이스케의 브랜드입니다. 빈티지 군복·워크웨어 해석으로 알려져 있습니다.',
    why: ['일본 브랜드끼리의 협업은 수량이 적어 마니아 수요가 몰려요.'] },
  { key: 'porter', label: 'PORTER (포터)', names: ['porter', '포터'],
    about: '일본 요시다 가방의 대표 라인입니다. 튼튼한 나일론 가방으로 유명합니다.',
    why: ['가방은 사이즈 고민이 없어 거래가 쉬운 편이에요.', '협업 가방은 수량이 적어 꾸준히 찾는 사람이 있어요.'] },
  { key: 'jjjjound', label: 'JJJJound (자운드)', names: ['jjjjound', '자운드'],
    about: '캐나다 몬트리올의 저스틴 사운더스가 만든 미니멀 디자인 스튜디오입니다.',
    why: ['뉴발란스 등 협업이 차분한 색으로 나와 오래 인기가 이어지는 편이에요.', '수량이 매우 적어요.'] },
  { key: 'ald', label: 'Aimé Leon Dore (에메 레온 도르)', names: ['aime leon dore', 'aimé leon dore', '에메 레온 도르', '에메레온도르'],
    about: '뉴욕의 테디 산티스가 만든 브랜드입니다. 뉴발란스 550의 인기를 다시 끌어올린 협업으로 알려져 있습니다.',
    why: ['클래식한 색 조합으로 실착 수요가 많아요.'] },
  { key: 'bape', label: 'BAPE (베이프)', names: ['bape', 'a bathing ape', '베이프'],
    about: '니고가 1993년 도쿄에서 만든 스트리트 브랜드입니다. 상어 후디와 BAPE STA 신발로 유명합니다.',
    why: ['로고와 카모 패턴이 상징적이라 협업마다 팬 수요가 있어요.'] },
  { key: 'humanmade', label: 'HUMAN MADE (휴먼메이드)', names: ['human made', '휴먼메이드'],
    about: '니고가 2010년에 만든 일본 브랜드입니다. 빈티지 아메리칸 캐주얼 느낌이 특징입니다.',
    why: ['니고의 영향력으로 협업마다 주목도가 높아요.'] },
  { key: 'sp5der', label: 'Sp5der (스파이더)', names: ['sp5der'],
    about: '래퍼 영 서그가 만든 스트리트 브랜드입니다.',
    why: ['젊은 층 인기가 높고, 스포츠 브랜드 협업은 화제성이 커요.'] },
  { key: 'kaws', label: 'KAWS (카우스)', names: ['kaws', '카우스'],
    about: '미국 아티스트입니다. X자 눈의 캐릭터로 유명합니다.',
    why: ['아트 컬렉터 수요까지 겹쳐 협업 상품의 소장 가치가 높아요.'] },
  { key: 'arsham', label: 'Daniel Arsham (다니엘 아샴)', names: ['daniel arsham', 'arsham', '다니엘 아샴'],
    about: '"미래의 유물"처럼 부서진 조각으로 유명한 미국 아티스트입니다.',
    why: ['한정 아트 오브젝트는 수량이 적어 수집가 수요가 높아요.'] },
  { key: 'sanrio', label: 'Sanrio (산리오)', names: ['sanrio', '산리오', '헬로키티', 'hello kitty'],
    about: '헬로키티·쿠로미 등을 만든 일본 캐릭터 회사입니다.',
    why: ['캐릭터 팬층이 넓어 굿즈형 협업은 빨리 품절되는 편이에요.'] },
  { key: 'pokemon', label: 'Pokémon (포켓몬)', names: ['pokemon', 'pokémon', '포켓몬'],
    about: '전 세계적인 게임·카드 캐릭터 IP입니다.',
    why: ['카드·굿즈 수집 수요가 커서 한정 상품은 웃돈이 붙는 경우가 많아요.'] },
  { key: 'peaceminusone', label: 'PEACEMINUSONE (피스마이너스원)', names: ['peaceminusone', '피스마이너스원'],
    about: '지드래곤이 만든 브랜드입니다.',
    why: ['지드래곤 팬덤 수요가 커서 협업 상품은 빨리 품절되는 편이에요.'] },
  { key: 'otw', label: 'Vans OTW (반스 OTW)', names: ['otw'],
    about: '반스의 상위 라인입니다. 클래식 모델을 고급 소재로 다시 만듭니다.',
    why: ['일반 라인보다 수량이 적어요. 협업(예: 비브람 밑창)은 기능성까지 더해져 관심이 높아요.'] },
  { key: 'salehe', label: 'Salehe Bembury (살레헤 벰버리)', names: ['salehe', '살레헤'],
    about: '자연에서 영감을 받은 디자인으로 알려진 미국 신발 디자이너입니다.',
    why: ['독특한 밑창과 색 조합으로 협업마다 화제가 되는 편이에요.'] },
  { key: 'patta', label: 'Patta (파타)', names: ['patta'],
    about: '네덜란드 암스테르담의 스트리트 편집숍이자 브랜드입니다.',
    why: ['나이키 에어맥스 협업 등으로 팬층이 두터워요.'] },
  { key: 'concepts', label: 'Concepts (컨셉츠)', names: ['concepts', '컨셉츠'],
    about: '미국 보스턴의 스니커즈 편집숍입니다. 스토리를 담은 협업으로 유명합니다.',
    why: ['특별 포장·스토리가 있는 협업이 많아 소장 수요가 있어요.'] },
  { key: 'atmos', label: 'atmos (아트모스)', names: ['atmos', '아트모스'],
    about: '일본 도쿄의 스니커즈 편집숍입니다.',
    why: ['에어맥스 등 협업 색 조합이 상징적이라 재발매 때마다 주목받아요.'] },
  { key: 'undefeated', label: 'Undefeated (언디핏)', names: ['undefeated', '언디핏', '언디피티드'],
    about: '미국 LA의 스니커즈 편집숍이자 브랜드입니다.',
    why: ['오래된 스니커즈 편집숍 협업이라 꾸준한 수요가 있어요.'] },
  { key: 'fog', label: 'Fear of God (피어오브갓)', names: ['fear of god', '피어오브갓', 'essentials fear'],
    about: '제리 로렌조가 만든 미국 브랜드입니다. 넉넉한 실루엣의 고급 캐주얼로 유명합니다.',
    why: ['고급 라인 협업은 수량이 적고 실착 수요도 커요.'] },
  { key: 'stoneisland', label: 'Stone Island (스톤 아일랜드)', names: ['stone island', '스톤 아일랜드', '스톤아일랜드'],
    about: '소재 연구로 유명한 이탈리아 브랜드입니다. 팔에 붙은 나침반 패치가 상징입니다.',
    why: ['특수 소재 협업은 소장 가치가 높아요.'] },
  { key: 'jacquemus', label: 'Jacquemus (자크뮈스)', names: ['jacquemus', '자크뮈스'],
    about: '프랑스 디자이너 시몽 포르트 자크뮈스의 브랜드입니다.',
    why: ['패션 수요가 커서 여성 사이즈 협업이 빨리 품절되는 편이에요.'] },
  { key: 'martinerose', label: 'Martine Rose (마틴 로즈)', names: ['martine rose', '마틴 로즈'],
    about: '런던의 디자이너입니다. 과감한 실루엣으로 알려져 있습니다.',
    why: ['독특한 디자인이라 마니아층 수요가 있어요.'] },
  { key: 'corteiz', label: 'Corteiz (코르테즈)', names: ['corteiz', 'crtz', '코르테즈'],
    about: '런던에서 게릴라식 드롭으로 유명해진 스트리트 브랜드입니다.',
    why: ['물량이 매우 적은 드롭 방식이라 협업 웃돈이 큰 편이에요.'] },
  { key: 'vaquera', label: 'Vaquera (바케라)', names: ['vaquera', '바케라'],
    about: '뉴욕의 실험적인 디자이너 브랜드입니다.',
    why: ['슈프림 등과의 협업은 디자인이 튀어 마니아 수요가 몰려요.'] },
  { key: 'polartec', label: 'Polartec (폴라텍)', names: ['polartec', '폴라텍'],
    about: '플리스 원단을 만든 미국 기능성 소재 회사입니다.',
    why: ['겨울철 플리스 수요와 맞물려 실착·리셀 수요가 함께 있어요.'] },
  { key: 'mcdonalds', label: "McDonald's (맥도날드)", names: ["mcdonald's", 'mcdonalds', '맥도날드'],
    about: '패스트푸드 브랜드입니다. 패션 브랜드와의 굿즈 협업이 종종 나옵니다.',
    why: ['굿즈형 한정 상품은 화제성 덕분에 단기간 웃돈이 붙는 경우가 있어요.'] },
  { key: 't1', label: 'T1 (티원)', names: ['t1'],
    about: '페이커가 소속된 한국 e스포츠 구단입니다.',
    why: ['우승 기념 상품은 팬덤 수요가 커서 응모 경쟁이 치열해요.'] },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (name) => (/[가-힣]/.test(name)
  ? (text) => text.includes(name)
  : ((re) => (text) => re.test(text))(new RegExp(`(^|[^a-z0-9])${escapeRe(name)}([^a-z0-9]|$)`, 'i')));
const MATCHERS = COLLABS.map((c) => ({ ...c, tests: c.names.map(matcher) }));

/** 제목에서 협업 상대를 찾는다. 협업 표시(x, ×, 협업)가 없으면 단독 상품으로 본다. */
export function findCollabs(title) {
  const text = String(title ?? '');
  if (!/\sx\s|×|\bx\b|협업|콜라보|collab/i.test(text)) return [];
  return MATCHERS.filter((c) => c.tests.some((t) => t(text.toLowerCase()) || t(text)));
}

/**
 * 협업 설명 + 지금 시장 근거. 근거는 크림·sibna에 뜬 같은 협업 상대의 상품과,
 * 크림 발매가로 확인한 웃돈만 쓴다.
 */
export function collabInfo(title, hot = []) {
  return findCollabs(title).map((c) => {
    const related = hot.filter((item) => c.tests.some((t) => t(String(item.name).toLowerCase()) || t(String(item.name))));
    const verified = related.filter((item) => item.premiumSource === 'kream' && Number.isFinite(item.premium));
    const avg = verified.length ? verified.reduce((sum, item) => sum + item.premium, 0) / verified.length : null;
    const best = [...verified].sort((a, b) => b.premium - a.premium)[0];
    const market = related.length
      ? `지금 크림·sibna에 ${c.label.split(' (')[0]} 관련 상품이 ${related.length}개 떠 있어요.${avg !== null
        ? ` 크림 발매가로 확인한 ${verified.length}개의 평균 웃돈은 ${avg > 0 ? '+' : ''}${Math.round(avg)}%예요.${best ? ` (최고: ${best.name} ${best.premium > 0 ? '+' : ''}${Math.round(best.premium)}%)` : ''}`
        : ''}`
      : '';
    return { key: c.key, label: c.label, about: c.about, why: c.why, market };
  });
}
