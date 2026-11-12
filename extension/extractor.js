// 화면에 표시된 상품만 읽는다. 네트워크 요청은 하지 않는다.
(() => {
  const PRODUCT_PATH = /\/(?:products|goods)\/(\d+)/;
  const COUNT_LABEL = /(관심|좋아요|찜|거래)\s*([\d.,]+\s*[만천]?)/;
  const MAX_CARD_DEPTH = 8;
  const SAMPLE_CARDS = 12;
  const SAMPLE_HTML_LENGTH = 3000;

  function detectSite(location) {
    if (location.hostname === 'kream.co.kr') {
      if (/^\/products\/\d+$/.test(location.pathname)) return 'kreamProduct';
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

  const won = (text) => (text ? Number(text.replaceAll(',', '')) : null);

  /**
   * KREAM 상품 페이지 글자에서 이름표가 붙은 값만 읽는다.
   * 예: '발매가 85,000원', '발매일 26/10/19', '거래 3,988', '▲ 20,000원(+16.8%)', '급상승 상의 1위'
   */
  function parseProductText(text, wishText, priceText) {
    const date = text.match(/발매일\s*(\d{2})\/(\d{2})\/(\d{2})/);
    const change = text.match(/([▲▼])\s*([\d,]+)원\s*\(([+-]?[\d.]+)%\)/);
    return {
      wish: wishText ? parseCount(wishText) : null,
      price: won(priceText?.match(/([\d,]+)\s*원/)?.[1]),
      releasePrice: won(text.match(/발매가\s*([\d,]+)\s*원/)?.[1]),
      releaseDate: date ? `20${date[1]}-${date[2]}-${date[3]}` : null,
      trades: won(text.match(/^거래\s*([\d,]+)\s*$/m)?.[1]),
      changePct: change ? Math.abs(Number(change[3])) * (change[1] === '▼' ? -1 : 1) : null,
      badge: text.match(/^((?:급상승|인기)\s.*\d+위)\s*$/m)?.[1] ?? '',
    };
  }

  /** '42분 전', '2시간 전', '3일 전', '26/11/10' 을 대략의 거래 시각(정시 단위)으로 바꾼다. */
  function agoToIso(text, now = Date.now()) {
    const hour = 3600 * 1000;
    let at = null;
    if (/방금/.test(text)) at = now;
    const m = text.match(/(\d+)\s*(분|시간|일)\s*전/);
    if (m) at = now - Number(m[1]) * { 분: 60 * 1000, 시간: hour, 일: 24 * hour }[m[2]];
    const d = text.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (d) at = Date.parse(`20${d[1]}-${d[2]}-${d[3]}T03:00:00Z`);
    return at === null ? null : new Date(Math.floor(at / hour) * hour).toISOString();
  }

  /**
   * 상품 페이지의 '체결 거래' 표(옵션·거래가·거래일)를 읽는다.
   * 예: '옵션\n거래가\n거래일\nXXL\n139,000원\n42분 전\nM\n119,000원\n2시간 전\n거래 내역 더보기'
   */
  function parseRecentTrades(text, now = Date.now()) {
    const start = text.indexOf('체결 거래');
    if (start < 0) return [];
    const head = text.indexOf('거래일', start);
    const end = text.indexOf('거래 내역 더보기', head);
    if (head < 0 || end < 0) return [];
    const lines = text.slice(head + 3, end).split('\n').map((l) => l.trim()).filter(Boolean);
    const trades = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const [size, priceText, ago] = lines.slice(i, i + 3);
      const price = priceText?.match(/^([\d,]+)\s*원$/)?.[1];
      const at = ago ? agoToIso(ago, now) : null;
      if (!price || !at) break;
      trades.push({ size, price: Number(price.replaceAll(',', '')), at });
    }
    return trades;
  }

  function readProduct(doc) {
    const id = doc.location.pathname.match(/^\/products\/(\d+)$/)?.[1];
    const wish = doc.querySelector(`[data-sdui-id="product_wish_count/${id}"]`);
    if (!id || !wish) return null;
    const price = doc.querySelector('.price-info-container .label-container p.bold');
    const name = doc.querySelector('meta[property="og:title"]')?.content ?? '';
    const text = doc.body.innerText;
    return { id, name, ...parseProductText(text, wish.textContent.trim(), price?.textContent), recentTrades: parseRecentTrades(text) };
  }

  globalThis.DealRadarExtractor = {
    detectSite, parseCount, parseCardLines, parseKreamLines, parseMusinsaLines, readCards, buildDiagnostic,
    parseProductText, readProduct, parseRecentTrades, agoToIso,
  };
})();
