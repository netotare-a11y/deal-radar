(() => {
  const { detectSite, readCards, buildDiagnostic } = globalThis.DealRadarExtractor;
  const SAVE_DELAY_MS = 1500;
  const UPLOAD_QUIET_MS = 15000;
  let uploadTimer = null;

  // 스크롤이 끝나고 잠시 조용해지면 지금까지 본 상품을 올린다.
  function scheduleUpload(site) {
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'upload', site }).catch(() => {});
    }, UPLOAD_QUIET_MS);
  }

  // 스크롤하면 화면 밖 상품이 사라지는 목록이 있어 본 상품을 누적한다.
  let currentPage = '';
  let seen = new Map();
  let timer = null;

  function capture() {
    timer = null;
    const site = detectSite(location);
    if (!site) return;

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

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
