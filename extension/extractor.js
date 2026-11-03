// 화면에 이미 표시된 상품만 읽는다. 네트워크 요청과 클릭은 하지 않는다.
(() => {
  const PRODUCT_PATH = /\/(?:products|goods)\/(\d+)/;
  const COUNT_LABEL = /(관심|좋아요|찜|거래)\s*([\d.,]+\s*[만천]?)/;
  const MAX_CARD_DEPTH = 8;
  const SAMPLE_CARDS = 12;
  const SAMPLE_HTML_LENGTH = 3000;

  function detectSite(location) {
    if (location.hostname === 'kream.co.kr') {
      return new URLSearchParams(location.search).get('tab') === 'home_ranking_v2' ? 'kream' : null;
    }
    if (location.hostname === 'www.musinsa.com' && location.pathname.startsWith('/main/musinsa/recommend')) {
      return 'musinsa';
    }
    return null;
  }

  function parseCount(text) {
    const value = text.replace(/[\s,]/g, '');
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) return null;
    if (value.endsWith('만')) return Math.round(number * 10000);
    if (value.endsWith('천')) return Math.round(number * 1000);
    return number;
  }

  /** 카드 글자에서 뜻이 확실한 값만 뽑는다. 라벨 없는 숫자는 무엇인지 몰라 추측하지 않는다. */
  function parseCardLines(lines) {
    const counts = {};
    let price = null;
    for (const line of lines) {
      const label = line.match(COUNT_LABEL);
      if (label) counts[label[1]] = parseCount(label[2]);
      const won = line.match(/([\d,]+)\s*원/);
      if (won && price === null) price = Number(won[1].replaceAll(',', ''));
    }
    return { price, counts };
  }

  /** 예: ['거래 2,395', '1', '▲1', '상품명', '26%', '162,000원'] */
  function parseKreamLines(lines) {
    const { price, counts } = parseCardLines(lines);
    const rest = lines.filter((line) => !COUNT_LABEL.test(line));
    const rankIndex = rest.findIndex((line) => /^\d+$/.test(line));
    const flux = rest[rankIndex + 1] ?? '';
    const hasFlux = rankIndex !== -1 && /^(▲|▼|-$|NEW)/i.test(flux);
    const after = rest.slice(rankIndex + (hasFlux ? 2 : 1));
    const name = after.find((line) => !/^\d+%$/.test(line) && !/원$/.test(line)) ?? '';
    const change = flux.match(/^([▲▼])\s*(\d+)/);
    return {
      rank: rankIndex === -1 ? null : Number(rest[rankIndex]),
      rankChange: change ? Number(change[2]) * (change[1] === '▲' ? 1 : -1) : hasFlux && /^NEW/i.test(flux) ? null : 0,
      isNewRank: hasFlux && /^NEW/i.test(flux),
      name,
      price,
      trades: counts['거래'] ?? null,
    };
  }

  /** 예: ['트릴리온', '상품명', '41%', '39,990원', '내일도착'] */
  function parseMusinsaLines(lines) {
    const { price } = parseCardLines(lines);
    const discount = lines.map((line) => line.match(/^(\d+)%$/)?.[1]).find(Boolean);
    return {
      brand: lines[0] ?? '',
      name: lines[1] ?? '',
      price,
      discount: discount ? Number(discount) : null,
    };
  }

  function productId(anchor) {
    return anchor.getAttribute('href')?.match(PRODUCT_PATH)?.[1] ?? null;
  }

  /** 다른 상품 링크가 섞이기 직전까지 올라간 요소를 그 상품의 카드로 본다. */
  function findCard(anchor, id) {
    let card = anchor;
    for (let depth = 0; depth < MAX_CARD_DEPTH && card.parentElement; depth += 1) {
      const parent = card.parentElement;
      if (parent === document.body) break;
      const others = [...parent.querySelectorAll('a[href]')].some((link) => {
        const other = productId(link);
        return other && other !== id;
      });
      if (others) break;
      card = parent;
    }
    return card;
  }

  function readCards(root) {
    const cards = new Map();
    for (const anchor of root.querySelectorAll('a[href]')) {
      const id = productId(anchor);
      if (!id || cards.has(id)) continue;
      const element = findCard(anchor, id);
      const lines = (element.innerText ?? element.textContent ?? '')
        .split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) continue;
      const image = element.querySelector('img');
      cards.set(id, {
        id,
        url: anchor.href,
        image: image?.currentSrc || image?.src || '',
        section: element.closest('[data-section-title]')?.dataset.sectionTitle
          ?? element.querySelector('[data-section-title]')?.dataset.sectionTitle
          ?? '',
        lines: lines.slice(0, 20),
        ...parseCardLines(lines),
        element,
      });
    }
    return [...cards.values()];
  }

  /** 구조 확인용 표본. 상품 카드만 담고, 쿠키·저장소·계정 영역은 읽지 않는다. */
  function buildDiagnostic(root, location, cards) {
    const patterns = new Map();
    for (const anchor of root.querySelectorAll('a[href]')) {
      let path;
      try {
        path = new URL(anchor.href).pathname.replace(/\d+/g, 'N');
      } catch {
        continue;
      }
      patterns.set(path, (patterns.get(path) ?? 0) + 1);
    }
    return {
      page: `${location.pathname}${location.search}`,
      cardCount: cards.length,
      linkPatterns: [...patterns].sort((a, b) => b[1] - a[1]).slice(0, 15),
      headings: [...root.querySelectorAll('h1,h2,h3')]
        .map((node) => node.textContent.trim()).filter(Boolean).slice(0, 30),
      samples: cards.slice(0, SAMPLE_CARDS).map((card) => ({
        id: card.id,
        lines: card.lines,
        price: card.price,
        counts: card.counts,
        html: card.element.outerHTML.slice(0, SAMPLE_HTML_LENGTH),
      })),
    };
  }

  globalThis.DealRadarExtractor = {
    detectSite, parseCount, parseCardLines, parseKreamLines, parseMusinsaLines, readCards, buildDiagnostic,
  };
})();
