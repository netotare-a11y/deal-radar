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

  /** 상품 페이지 값을 상품별로 모은다. 관심수는 1시간 간격으로 쌓아 증가 속도를 계산한다. */
  function mergeDetails(previous, details, nowIso) {
    const now = Date.parse(nowIso);
    const merged = {};
    for (const [id, old] of Object.entries(previous ?? {})) {
      if (now - Date.parse(old.at) < DETAIL_KEEP_MS) merged[id] = old;
    }
    for (const { at, ...detail } of details ?? []) {
      const old = merged[detail.id];
      const wishes = [...(old?.wishes ?? [])];
      if (Number.isFinite(detail.wish)) {
        const last = wishes.at(-1);
        if (last && Date.parse(at) - Date.parse(last[0]) < WISH_GAP_MS) wishes.pop();
        wishes.push([at, detail.wish]);
      }
      merged[detail.id] = { ...old, ...detail, name: detail.name || old?.name || '', at, wishes: wishes.slice(-MAX_WISH_POINTS) };
    }
    return merged;
  }

  /** 3시간 안에 다시 열면 마지막 기록을 교체해 하루 추세가 짧은 간격에 쏠리지 않게 한다. */
  function mergeSnapshot(previous, site, record, nowIso) {
    const items = (record.items ?? []).map((item) => toItem(site, item)).filter((item) => item.name);
    const next = { ...previous, site };

    if (items.length) {
      if (items.length < MIN_ITEMS) {
        throw new Error(`읽은 상품이 ${items.length}개뿐이라 올리지 않았습니다.`);
      }
      const entry = {
        at: nowIso,
        items: Object.fromEntries(items.map((item) => [item.id, [item.rank, item.trades, item.price]])),
      };
      const history = [...(previous?.history ?? [])];
      const last = history.at(-1);
      if (last && Date.parse(nowIso) - Date.parse(last.at) < SNAPSHOT_GAP_MS) history.pop();
      history.push(entry);
      Object.assign(next, { updatedAt: nowIso, items, history: history.slice(-MAX_SNAPSHOTS) });
    }
    if (record.fresh?.length) {
      const fresh = record.fresh.map((item) => toItem(site, item)).filter((item) => item.name);
      if (fresh.length >= MIN_ITEMS) Object.assign(next, { fresh, freshAt: nowIso });
    }
    if (record.details?.length) next.details = mergeDetails(previous?.details, record.details, nowIso);
    if (!next.updatedAt) throw new Error('올릴 랭킹 기록이 없습니다.');
    return next;
  }

  globalThis.DealRadarSnapshot = { mergeSnapshot, mergeDetails, toItem };
})();
