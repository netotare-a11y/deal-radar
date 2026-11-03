const SITES = [
  { id: 'musinsa', name: '무신사 추천', url: 'https://www.musinsa.com/main/musinsa/recommend?gf=A' },
  { id: 'kream', name: 'KREAM 랭킹', url: 'https://kream.co.kr/?tab=home_ranking_v2' },
];

const formatTime = (iso) => new Date(iso).toLocaleString('ko-KR');

function uploadText(result) {
  if (!result) return '아직 올리지 않음';
  return result.ok ? `올림 · ${formatTime(result.at)}` : `실패: ${result.error}`;
}

function renderSite(site, record, uploaded) {
  const box = document.createElement('div');
  box.className = 'site';

  const name = document.createElement('a');
  name.className = 'name';
  name.href = site.url;
  name.target = '_blank';
  name.textContent = site.name;

  const state = document.createElement('div');
  state.className = 'state';
  state.textContent = record
    ? `읽은 상품 ${record.items.length}개 · ${formatTime(record.capturedAt)}`
    : '아직 기록 없음. 이름을 눌러 페이지를 여세요.';

  const upload = document.createElement('div');
  upload.className = 'state';
  upload.textContent = uploadText(uploaded);

  box.append(name, state, upload);

  if (record) {
    const button = document.createElement('button');
    button.textContent = '지금 올리기';
    button.addEventListener('click', async () => {
      button.disabled = true;
      upload.textContent = '올리는 중…';
      const result = await chrome.runtime.sendMessage({ type: 'upload', site: site.id, force: true });
      upload.textContent = uploadText(result.at ? result : { ok: false, error: result.error });
      button.disabled = false;
    });
    box.append(button);
  }
  return box;
}

function renderToken(hasToken) {
  const box = document.getElementById('token');
  box.replaceChildren();

  const state = document.createElement('div');
  state.className = 'state';
  state.textContent = hasToken ? 'GitHub 토큰 등록됨' : 'GitHub 토큰을 등록해야 인기 탭에 올라갑니다.';

  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = hasToken ? '교체할 토큰 붙여넣기' : '토큰 붙여넣기';
  input.autocomplete = 'off';

  const save = document.createElement('button');
  save.textContent = '저장';
  save.addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) return;
    await chrome.storage.local.set({ githubToken: value });
    renderToken(true);
  });

  box.append(state, input, save);
}

const keys = SITES.flatMap((site) => [`latest:${site.id}`, `upload:${site.id}`]);
chrome.storage.local.get([...keys, 'githubToken'], (stored) => {
  const container = document.getElementById('sites');
  for (const site of SITES) {
    container.append(renderSite(site, stored[`latest:${site.id}`], stored[`upload:${site.id}`]));
  }
  renderToken(Boolean(stored.githubToken));
});
