(() => {
  const { detectSite, readCards, buildDiagnostic, readProduct } = globalThis.DealRadarExtractor;
  const SAVE_DELAY_MS = 1500;
  const UPLOAD_QUIET_MS = 15000;
  const AUTO = location.hash === '#dealradar-auto';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => {});

  const cardsOf = () => readCards(document.body).map(({ element, ...card }, i) => ({ ...card, position: i + 1 }));

  // 확장이 연 뒤쪽 탭: 랭킹 보기 두 개를 차례로 눌러 읽고 돌려준다.
  async function autoRanking() {
    const tabButton = (text) => [...document.querySelectorAll('.home-ranking-tab__item')]
      .find((el) => el.textContent.trim() === text);
    const waitCards = async (before) => {
      for (let i = 0; i < 20; i += 1) {
        await sleep(750);
        const cards = cardsOf();
        if (cards.length >= 5 && cards[0].id !== before) return cards;
      }
      return cardsOf();
    };

    let main = [];
    for (let i = 0; i < 20 && main.length < 5; i += 1) {
      await sleep(750);
      main = cardsOf();
    }
    let fresh = [];
    const freshTab = tabButton('뜨는 신상');
    if (freshTab) {
      freshTab.click();
      fresh = await waitCards(main[0]?.id);
      if (fresh[0]?.id === main[0]?.id) fresh = [];
    }
    send({ type: 'autoRanking', main, fresh });
  }

  async function product() {
    for (let i = 0; i < 30; i += 1) {
      const detail = readProduct(document);
      if (detail && detail.wish !== null) {
        send({ type: 'detail', detail, auto: AUTO });
        return;
      }
      await sleep(500);
    }
    if (AUTO) send({ type: 'detail', detail: null, auto: true });
  }

  // 직접 연 랭킹·무신사 화면: 스크롤하며 본 상품을 누적해 두었다가 올린다.
  let uploadTimer = null;
  function scheduleUpload(site) {
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => send({ type: 'upload', site }), UPLOAD_QUIET_MS);
  }

  let currentPage = '';
  let seen = new Map();
  let timer = null;

  function capture() {
    timer = null;
    const site = detectSite(location);
    if (site !== 'kream' && site !== 'musinsa') return;

    const page = `${location.pathname}${location.search}`;
    if (page !== currentPage) {
      currentPage = page;
      seen = new Map();
    }

    const cards = readCards(document.body);
    for (const { element, ...card } of cards) {
      if (!seen.has(card.id)) seen.set(card.id, { ...card, position: seen.size + 1 });
      else seen.set(card.id, { ...seen.get(card.id), ...card });
    }

    chrome.storage.local.set({
      [`latest:${site}`]: {
        site,
        page,
        capturedAt: new Date().toISOString(),
        items: [...seen.values()],
        diagnostic: buildDiagnostic(document.body, location, cards),
      },
    });
    if (seen.size) scheduleUpload(site);
  }

  function schedule() {
    if (timer === null) timer = setTimeout(capture, SAVE_DELAY_MS);
  }

  const site = detectSite(location);
  if (site === 'kreamProduct') product();
  else if (site === 'kream' && AUTO) autoRanking();
  else {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  }
})();
