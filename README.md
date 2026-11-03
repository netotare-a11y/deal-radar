# 딜레이더

발매정보와 핫딜을 모아 보여주는 개인용 사이트와, 새 소식을 알려주는 안드로이드 앱입니다.

## 구조

```
GitHub Actions (15분마다)
  ├ today(sibna) RSS, 뉴스 → 발매 일정·뉴스
  ├ 루리웹 RSS, 게시판 목록 → 핫딜·추천수
  └ GitHub Pages → 사이트 + data/feed.json

안드로이드 앱 (약 15분마다)
  └ feed.json 확인 → 새 항목이 있으면 휴대폰 알림
```

| 소스 | 방식 |
| --- | --- |
| today(sibna) | 공식 RSS 수집 |
| 루리웹 핫딜 | RSS와 게시판 목록 수집 |
| 무신사 | 바로가기만 제공. robots.txt가 등록되지 않은 봇을 전면 차단 |
| 인스타그램 | 바로가기만 제공. 공개 수집 경로 없음 |

## 로컬 미리보기

```powershell
npm run preview   # 수집 후 http://localhost:4173 실행
npm test
```

## 설정 변경: `config.json`

| 항목 | 의미 |
| --- | --- |
| `watchKeywords` | 관심 키워드. 표시되고 핫딜 알림 조건에도 쓰임 |
| `releases.excludeKeywords` | 발매 목록에서 뺄 단어 |
| `notify.releases` | `all`은 모든 새 발매, `watch`는 관심 키워드만 알림 |
| `notify.dealMinRecommend` | 핫딜 알림 기준 추천수 |
| `notify.quietHours` | 알림을 미루는 시간(KST) |
| `notify.maxIndividualAlerts` | 이 건수를 넘으면 알림 하나로 묶음 |
| `shortcuts.instagramAccounts` | 인스타그램 계정 바로가기(@ 없이 입력) |

설정을 바꿔 푸시하면 사이트에 반영되고, 앱은 다음 확인 때 새 설정을 따릅니다. 앱을 다시 설치할 필요는 없습니다.

## 배포

```powershell
winget install GitHub.cli
gh auth login --web
git init -b main
git add .
git commit -m "feat: 딜레이더 첫 버전"
gh repo create deal-radar --public --source . --push
gh api -X POST repos/{owner}/deal-radar/pages -f build_type=workflow
gh workflow run collect.yml
```

주소는 `https://아이디.github.io/deal-radar/` 입니다.

저장소는 공개입니다. 비공개 저장소의 Pages는 유료 요금제가 필요하고 Actions 무료 시간도 제한됩니다. 수집한 내용은 저장소에 커밋하지 않습니다.

## 안드로이드 앱

`android/` 폴더를 푸시하면 GitHub Actions가 테스트 후 APK를 빌드해 `app` 릴리스에 올립니다. PC에 Android SDK가 없어도 됩니다.

서명 키는 첫 빌드 때 자동으로 만들어져 `android/release.keystore.enc`에 암호화되어 저장됩니다. 비밀번호는 시크릿 `ANDROID_KEYSTORE_PASSWORD`에만 있습니다.

앱 업데이트는 같은 키로 서명해야 덮어쓸 수 있습니다. 키나 비밀번호를 잃어버리면 앱을 지우고 다시 설치해야 합니다.

### 휴대폰 설치

1. 휴대폰 Chrome으로 사이트를 열고 **바로가기 > 안드로이드 앱 받기**를 누릅니다.
2. 받은 파일을 열고, 안내가 나오면 Chrome의 "출처를 알 수 없는 앱 설치"를 허용합니다.
3. 앱을 처음 열 때 알림을 허용합니다.
4. 이어서 나오는 배터리 최적화 제외 요청도 허용합니다. 거절하면 화면이 꺼진 동안 알림이 크게 늦어집니다.

## 인기 탭과 Chrome 확장

무신사와 KREAM은 서버 자동 수집이 막혀 있어, PC Chrome 확장(`extension/`)이 직접 연 화면을 읽어 `trend/*.json`에 올립니다. 올라가면 사이트가 자동으로 다시 배포됩니다.

| 사이트 | 페이지 | 읽는 값 |
| --- | --- | --- |
| KREAM | `kream.co.kr/?tab=home_ranking_v2` | 순위, 순위 변동, 거래 수, 가격 |
| 무신사 | `musinsa.com/main/musinsa/recommend` | 브랜드, 상품명, 가격, 할인율 |

- 관심 수와 좋아요 수는 두 페이지에 숫자로 표시되지 않아 추적하지 않습니다.
- 거래 급증은 이전 기록과 비교한 표시값의 증가분입니다. 큰 수는 사이트에서 반올림되어 보일 수 있습니다.
- 페이지를 열 때만 기록됩니다. 확장은 사이트에 요청을 보내거나 자동으로 페이지를 조작하지 않습니다.

설치: `chrome://extensions`에서 개발자 모드를 켜고 `extension` 폴더를 로드합니다.

GitHub 토큰: [fine-grained 토큰](https://github.com/settings/personal-access-tokens/new)을 `deal-radar` 저장소 한 곳에만, Contents 읽기·쓰기 권한으로 만들어 확장 팝업에 저장합니다. 토큰이 만료되면 팝업에 실패 메시지가 나오므로 새 토큰으로 교체합니다.

## 알림 규칙

- 설치 직후 이미 있던 글은 알리지 않습니다.
- 새 항목이 3건 이하면 건별로 보내며, 누르면 원문이 열립니다. 그보다 많으면 하나로 묶고, 누르면 앱이 열립니다.
- 00~08시에는 보내지 않고, 08시 이후 첫 확인 때 오늘 발매 요약과 함께 보냅니다.
- 알림 시각은 수집 주기와 안드로이드 절전 정책에 따라 늦어질 수 있습니다.

## 문제 확인

사이트 상단 경고와 **바로가기 > 수집 상태**를 봅니다. 수집이 실패하면 직전 데이터를 유지합니다. 자세한 원인은 GitHub 저장소의 Actions 로그에 있습니다.

| 증상 | 조치 |
| --- | --- |
| 알림이 늦거나 안 옴 | 앱 알림 허용과 배터리 최적화 제외를 확인합니다. 삼성 휴대폰은 "절전 예외 앱"에도 추가합니다. |
| 특정 소스 수집 실패가 계속됨 | 사이트 구조가 바뀌었거나 GitHub 서버 IP가 차단됐을 수 있습니다. |
