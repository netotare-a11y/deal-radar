// 한 사이트의 기록 파일을 갱신한다. 서비스 워커와 테스트가 함께 쓴다.
(() => {
  const SNAPSHOT_GAP_MS = 3 * 60 * 60 * 1000;
  const MAX_SNAPSHOTS = 120;
  const MIN_ITEMS = 5;
  const WISH_GAP_MS = 60 * 60 * 1000;
  const MAX_WISH_POINTS = 60;
  const DETAIL_KEEP_MS = 14 * 24 * 60 * 60 * 1000;

  function toItem(site, record) {
    const { parseKreamLines, parseMusinsaLines } = globalThis.DealRadarExtractor;
    const parsed = site === 'kream' ? parseKreamLines(record.lines) : parseMusinsaLines(record.lines);
    return {
      id: record.id,
      url: record.url,
      image: record.image,
      section: record.section ?? '',
      position: record.position,
      ...parsed,
    };
  }

  // 기록 파일이 GitHub 내용 API 한도(1MB)를 넘지 않게 상품당 60건, [사이즈, 가격, 시각]으로 줄여 둔다.
  const MAX_TRADES = 60;
  const TRADE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

  /**
   * 페이지에는 최근 체결 5건만 보여 방문할 때마다 쌓는다.
   * 거래 시각이 '2시간 전'처럼 대략이라 사이즈·가격·정시가 같으면 같은 거래로 본다.
   */
  function mergeTrades(old = [], fresh = [], nowIso) {
    const now = Date.parse(nowIso);
    const seen = new Map();
    const rows = [...old, ...(fresh ?? []).map((t) => [t.size, t.price, t.at])];
    for (const [size, price, at] of rows) {
      if (!size || !Number.isFinite(price) || !(now - Date.parse(at) <= TRADE_KEEP_MS)) continue;
      seen.set(`${size}|${price}|${at}`, [size, price, at]);
    }
    return [...seen.values()].sort((a, b) => a[2].localeCompare(b[2])).slice(-MAX_TRADES);
  }
  /** 상품 페이지 값을 상품별로 모은다. 관심수는 1시간 간격으로 쌓아 증가 속도를 계산한다. */
  function mergeDetails(previous, details, nowIso) {
    const now = Date.parse(nowIso);
    const merged = {};
    for (const [id, old] of Object.entries(previous ?? {})) {
      if (now - Date.parse(old.at) < DETAIL_KEEP_MS) merged[id] = old;
    }
    for (const { at, recentTrades, ...detail } of details ?? []) {
      const old = merged[detail.id];
      const wishes = [...(old?.wishes ?? [])];
      if (Number.isFinite(detail.wish)) {
        const last = wishes.at(-1);
        if (last && Date.parse(at) - Date.parse(last[0]) < WISH_GAP_MS) wishes.pop();
        wishes.push([at, detail.wish]);
      }
      merged[detail.id] = {
        ...old, ...detail, name: detail.name || old?.name || '', at,
        wishes: wishes.slice(-MAX_WISH_POINTS),
        // 'trades'는 페이지의 누적 거래 수라 이름을 나눠 둔다.
        tradeLog: mergeTrades(old?.tradeLog, recentTrades, nowIso),
      };
    }
    return merged;
  }

  /** 3시간 안에 다시 열면 마지막 기록을 교체해 하루 추세가 짧은 간격에 쏠리지 않게 한다. */
  function mergeSnapshot(previous, site, record, nowIso) {
    const items = (record.items ?? []).map((item) => toItem(site, item)).filter((item) => item.name);
    const fresh = (record.fresh ?? []).map((item) => toItem(site, item)).filter((item) => item.name);
    const next = { ...previous, site };

    if (items.length) {
      if (items.length < MIN_ITEMS) {
        throw new Error(`읽은 상품이 ${items.length}개뿐이라 올리지 않았습니다.`);
      }
      const entry = {
        at: nowIso,
        items: Object.fromEntries(items.map((item) => [item.id, [item.rank, item.trades, item.price]])),
        // 자주 뜨는 상품을 세려고 뜨는 신상 목록도 시간별로 남긴다.
        ...(fresh.length >= MIN_ITEMS ? { fresh: fresh.map((item) => item.id) } : {}),
      };
      const history = [...(previous?.history ?? [])];
      const last = history.at(-1);
      if (last && Date.parse(nowIso) - Date.parse(last.at) < SNAPSHOT_GAP_MS) history.pop();
      history.push(entry);
      Object.assign(next, { updatedAt: nowIso, items, history: history.slice(-MAX_SNAPSHOTS) });
    }
    if (fresh.length >= MIN_ITEMS) Object.assign(next, { fresh, freshAt: nowIso });
    if (record.details?.length) next.details = mergeDetails(previous?.details, record.details, nowIso);
    if (!next.updatedAt) throw new Error('올릴 랭킹 기록이 없습니다.');
    return next;
  }

  globalThis.DealRadarSnapshot = { mergeSnapshot, mergeDetails, mergeTrades, toItem };
})();
