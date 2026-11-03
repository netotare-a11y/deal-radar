// 한 사이트의 기록 파일을 갱신한다. 서비스 워커와 테스트가 함께 쓴다.
(() => {
  const SNAPSHOT_GAP_MS = 3 * 60 * 60 * 1000;
  const MAX_SNAPSHOTS = 120;
  const MIN_ITEMS = 5;

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

  /** 3시간 안에 다시 열면 마지막 기록을 교체해 하루 추세가 짧은 간격에 쏠리지 않게 한다. */
  function mergeSnapshot(previous, site, record, nowIso) {
    const items = record.items.map((item) => toItem(site, item)).filter((item) => item.name);
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

    return { site, updatedAt: nowIso, items, history: history.slice(-MAX_SNAPSHOTS) };
  }

  globalThis.DealRadarSnapshot = { mergeSnapshot, toItem };
})();
