# PROJECT_STATUS — 서울 교통·생활 정보 앱

> - **최종 갱신**: 2026-08-07
> - **위치(절대경로)**: `C:\Users\GB\Documents\gong-medical-app`
> - **GitHub**: `cslis07/gong-medical-app` · 기본 브랜치 `main`
> - **배포**: https://gong-medical-app.vercel.app · **Vercel(cslis07 계정)**, `vercel --prod --yes` CLI 직접 배포
> - **규모**: 순수 HTML+vanilla JS(빌드툴 없음). 첫 화면 **🏠 홈 허브** + 탭 **활성 8 / 숨김 6** · API 핸들러 `lib/*.js` 14종(단일 catch-all 함수 1개) · 프론트 `js/*.js` 7개 · 빌드 스냅샷 `data/*.js` 4개 · 빌드 스크립트 `scripts/*.mjs` 4개

---

## 0. 지금 하던 일 (WIP)

> 작업 재개 시 `git status`로 실제 상태를 한 번 더 확인할 것(문서가 「깨끗」이라 적어도 문서 자신이 미커밋일 수 있다 — 2026-08-07에 실제로 그랬다).

- **직전 세션 작업(2026-08-07)**: **🏠 홈 허브 신설 + 상단 군더더기 제거 — 첫 화면 리뉴얼**. 이전엔 첫 화면이 곧 지하철 탭이었고 나머지는 카테고리를 눌러야 보였다(주차장 = 2클릭, 무엇이 있는지 첫 화면에 없음). 이제 홈이 기본 패널이고 **살아 있는 탭 8개 전부가 1클릭**. 약보듬(`C:\Users\GB\Documents\yakbodeum`) 홈 허브 구조를 참고했다. 이어서 사용자 요청으로 **헤더 큰 제목·소개문구 + 카테고리 바·서브탭 줄을 제거**(홈 브랜드 블록과 중복 + 모바일 첫 화면 잠식). 첫 화면 기준 헤더 161→68px, 본문 시작 245→96px. 그 직전엔 탭 6개 숨김(`data-off`), 그 앞은 야간진료 탭 신규.
- **다음 채팅이 가장 먼저 할 한 가지**: 특별히 없음. 굳이 꼽으면 **실기기(폰) 육안 확인** — 홈 히어로 카드는 560px 이하에서 가로형으로 바뀐다. 데스크톱 2열 히어로는 CSS만 확인했고 실측은 못 했다(이 머신 Chrome 확장이 뷰포트를 501px 위로 못 늘림 — 스크린샷도 자주 타임아웃).

---

## 1. 프로젝트 목적

공공/공식 데이터로 **서울(수도권) 교통·생활 정보**를 한 화면에서 조회하는 **무료·무로그인** 웹앱. 상단 카테고리(교통·주거·생활) → 서브탭 구조.

- **구조**: 순수 HTML + vanilla JS(빌드 없음) + **Vercel 서버리스 프록시**(API 키 은닉·CORS 우회·스크래핑).
- **원칙**: 예매·결제·개인정보 입력 안 함. 조회만, 예매/결제는 공식 페이지로 링크(handoff). 서버 상태 저장 없음 — 사용자 데이터는 브라우저 `localStorage`에만.
- **최근 방향성(2026-07~08)**: 초기 12탭에서 → 야간진료 추가(생활) → **불필요 탭 6개 숨김**으로 정리. 즉 "많은 탭"보다 **핵심 탭 + 실시간성·편의기능(즐겨찾기·공유·지도·내주변)** 강화 방향.
- **이력**: 공공의료 앱 → 지하철 전용 개편 → k-skill 참고 생활서비스 확장 → data.go.kr/EX/OPINET 대량 확장 → 2026-07-10 영화관·고속/시외버스 탭 제거 → 2026-08 탭 6개 숨김. URL·Vercel 프로젝트명(`gong-medical-app`)은 하위호환 위해 유지(옛 공공의료 잔재).

---

## 2. 현재 구현된 기능

### 🏠 홈 허브 (첫 화면, 2026-08-07 신설)

`#home` = 기본 패널. 브랜드 → "무엇을 찾으세요?" → **자주 찾는 정보 4칸**(지하철·내주변·주차장·야간진료, 설명 포함 큰 카드) → **전체 서비스 그리드**(살아 있는 탭 전부) → 즐겨찾기 모아보기·이용가이드.

- **카드는 HTML에 없다.** `js/services.js`의 `renderHub()`가 `index.html`의 `.toptab:not([data-off])` 목록에서 만든다 → **탭을 숨기면 홈 카드도 사라지고, `data-off`만 지우면 카드까지 함께 돌아온다.** 설명·대표색은 같은 파일 `HUB` 표(`hero:1`이면 위쪽 큰 카드에도 노출).
- **상단 내비는 없다**(2026-08-07 2차, 사용자 요청으로 카테고리 바·서브탭 줄 둘 다 제거). 탭 이동은 홈이 전담하고, 탭 안에서는 `← 홈 | 🏥 야간진료` 한 줄만 뜬다 — 결과가 길어도 닿게 **sticky**(`.topnav.nav-bar`, 홈에서는 클래스가 빠져 높이 0). 현재 화면 이름(`#hereNow`)은 숨은 `.toptab` 텍스트를 그대로 읽어 이름의 원본을 하나로 유지한다.
- **헤더도 제목·소개문구 없이 버튼줄만**(`.app-header.slim`). `<h1>`은 지우지 않고 `.sr-only`로 화면에서만 감췄다 — 검색엔진·스크린리더용. 홈 브랜드 블록이 눈에 보이는 제목 역할.
- 딥링크는 그대로다(`#gas` 등으로 들어오면 홈을 건너뛰고 해당 탭). 해시 없으면 홈.

### 탭 (활성 8 · 숨김 6)

| 탭 | 상태 | 기능 | 데이터 소스 | 키 |
|---|---|---|---|---|
| 🚇 지하철 | 활성 | 노선도→역 검색→도착·위치·첫막차·최단경로·편의시설·승하차·공기질 종합 모달 | 서울 열린데이터 | SEOUL_API_KEY / SEOUL_REALTIME_KEY |
| 🚲 따릉이 | 활성 | 주변 대여소 실시간 자전거·거치대(정렬: 거리/자전거많은순) | 서울 bikeList | SEOUL_API_KEY |
| 🛣️ 고속도로 | 활성 | 휴게소 / 실시간 소통 / **실시간 돌발·문자** / **구간 실시간 소요시간** | 한국도로공사 EX | EX_API_KEY |
| 📍 내주변 | 활성 | 현위치 기준 주유소·따릉이·주차장 상위3 통합(버스 그룹은 시내버스 숨김에 맞춰 제거) | 위 소스 병렬 | 상동 |
| 🅿️ 주차장 | 활성 | 전국 17,768곳 가까운 순 + 서울 일부 실시간 잔여면수 · 서버 페이지네이션 | 서울 GetParkInfo/Info · 표준데이터 스냅샷 | SEOUL_API_KEY / DATA_API_KEY |
| 🏥 야간진료 | 활성 | 반경 내 야간(오늘 종료 ≥선택시각) 병의원 · 지금진료중·거리·전화·지도 · 종류(일반의원/치과/한의원)·야간기준·반경 필터 | 국립중앙의료원 E-Gen 스냅샷 | DATA_API_KEY |
| 👥 혼잡도 | 활성 | 서울 핫스팟 120여곳 실시간 인구·혼잡도·성별/연령 | citydata_ppltn | SEOUL_API_KEY |
| ⛽ 주유소 | 활성 | 반경 최저가(정렬: 가격/거리) + 전국 평균유가 바 + **최근 7일 유가추이 스파크라인** | Opinet | OPINET_API_KEY |
| 🚏 시내버스 | **숨김** | 주변 정류소→실시간 도착 | 국토부 TAGO | DATA_API_KEY |
| 🏠 실거래가 | **숨김** | 매매/전세/월세/분양권 · 단지명·가격 필터 · 시세추이 · 신고가 랭킹 · 전량수집 | 국토부 RTMS | DATA_API_KEY |
| 🏘️ LH청약 | **숨김** | LH 공고(지역·상태 필터, .ics) / 공공임대 단지 | LH · 마이홈 | DATA_API_KEY |
| 😷 미세먼지 | **숨김** | 측정소 PM10/PM2.5 + 오늘/내일/모레 예보 + WHO토글 + 헤더 배지 | 에어코리아 | DATA_API_KEY |
| 🎰 로또 | **숨김** | 회차 당첨번호·등수 계산·자동생성 | smok95 CDN 미러 | 불필요 |
| 🧳 분실물 | **숨김** | LOST112·서울교통공사 조회 조건 정리 + 공식 링크 | — | 불필요 |

> **숨김 처리**(2026-08, 사용자 요청): 위 6개 탭은 삭제가 아니라 **`data-off="1"` + CSS `.toptab[data-off]{display:none}`**. `panelNames()`/`firstTabOfCat()`가 `:not([data-off])`로 걸러 네비·해시(`#air` 등)로도 안 열림. **패널·핸들러·favorites/map/refresh 등록은 그대로 살아 있음** → `index.html`에서 해당 `<button>`의 `data-off`만 지우면 즉시 복구. 헤더 미세먼지 배지(`/api/air?op=metro`)는 탭과 별개라 계속 동작.

### 공통 기능·UI (코드에 안 적힌 맥락 위주)
- **디자인 토큰**: `css/style.css` 전부 CSS 변수 기반. 라이트/다크 자동(`prefers-color-scheme`) + 헤더 토글(`js/theme.js`, auto→light→dark). 배경은 **민무늬**(워터마크 제거됨, 가독성 우선).
- **즐겨찾기·최근조회**(`js/favorites.js`): `PANELS` 레지스트리 기반, `localStorage`(`gong.fav.v1`/`gong.recent.v1`). 조회 시 조건 스냅샷 자동 기록, ⭐고정, 칩 클릭 재조회. **공유 링크**(URL 쿼리 인코딩+`navigator.share`/클립보드, 로드 시 `restoreFromUrl` 복원) · **백업/복원(JSON)** · **통합 대시보드(모아보기)** 포함. 지하철은 동적 UI라 `delegate` 방식.
- **지도 뷰**(`js/map.js`): 위치기반 탭(주유소·따릉이·주차장·야간진료·시내버스) 결과를 Leaflet+OSM에 divIcon 핀. **CSP 대응**으로 Leaflet은 `/vendor/leaflet/` 로컬 벤더링, OSM 타일 도메인만 `img-src` 예외. 처음 열 때만 지연 로드.
- **PWA**(`manifest.webmanifest`+`sw.js`+`js/pwa.js`): 설치 버튼 + 새버전 업데이트 배너. **SW는 네트워크 우선**(오프라인만 캐시), 문서는 `no-cache` 재검증(배포 직후 stale 방지).
- **위치 캐시**: `getLocation`(services.js) 모듈전역 `lastLoc` 5분 TTL — 위치탭 간 GPS 재요청 제거.
- **실시간 새로고침**: 혼잡도·따릉이·주차장 등에 🔄 + `kstClock()` 기준시각.
- 로딩 스켈레톤·빈상태 카드(`endEmpty`)·오류 재시도 박스·`aria-live`·입력창 ×버튼·모바일 최적화·📖 `guide.html`.

---

## 3. 수정한 주요 파일 (★ = 최근 세션 신규)

| 경로 | 역할 |
|---|---|
| `api/[service].js` | 단일 catch-all 라우터(Vercel 함수 1개) → `lib/` 동적 import 위임 + 서비스별 CDN 캐시 표 |
| `lib/subway.js` `density.js` `lotto.js` `gas.js` `bike.js` `highway.js` `realestate.js` `air.js` `citybus.js` `parking.js` `lh.js` `myhome.js` `geocode.js` | 서비스별 API 핸들러 |
| ★ `lib/clinic.js` | 야간진료 병의원 — 스냅샷 좌표 반경 필터, HANDLERS에 `clinic` 등록 |
| `lib/kotsa-parking.js` | 공단 B553881 클라이언트(비핸들러, 백엔드 장애로 빈 스냅샷) |
| `lib/pool.js` | 동시성 제한 + 재시도(전량수집용, 비핸들러) |
| `lib/respond.js` | 에러 응답 정제(원문·키 유출 차단). `errorMessage()` 사용. `redact()`는 정의만·미사용(삭제 금지, §9) |
| `js/app.js` | 지하철 전용 로직(노선도·역 종합 모달). ★`initMapZoom`이 `window.__refitSubwayMap` 등록 |
| ★ `js/services.js` | 나머지 탭 로직 + 탭 전환(`switchPanel`) + 공용 `getLocation` + **홈 허브(`HUB`·`renderHub`)** |
| ★ `js/favorites.js` | 즐겨찾기·최근조회·공유·백업·대시보드 |
| ★ `js/map.js` | 지도 뷰(`GongMap.set(panel, points, center)`) |
| ★ `js/pwa.js` `sw.js` | 서비스워커 등록/업데이트 배너 · SW(네트워크 우선) |
| `js/theme.js` `js/guide.js` | 테마 부트스트랩 · 가이드 전용 스크립트(CSP상 인라인 분리) |
| ★ `data/night-clinics.js` | 야간(18:30↑) 병의원 43,384곳 컬럼형 스냅샷(≈10MB, 자동생성) |
| `data/parking-nationwide.js` | 전국 주차장 17,768곳(4.5MB, 자동생성) |
| `data/parking-kotsa.js` | 공단 시설+운영 스냅샷(현재 빈 배열 — 백엔드 장애) |
| ★ `data/ex-tollgates.js` | 고속도로 영업소 566곳 코드+이름(구간소요시간 드롭다운, 자동생성) |
| `scripts/build-parking-snapshot.mjs` | 주차장 스냅샷 빌더(`npm run build:parking`) |
| ★ `scripts/build-night-clinics.mjs` | 야간진료 스냅샷 빌더(`npm run build:clinics`) |
| ★ `scripts/build-ex-tollgates.mjs` | 영업소 목록 빌더(`npm run build:tollgates`) |
| ★ `scripts/build-assets.mjs` | PWA 아이콘·OG PNG 빌더(`npm run build:assets`, sharp devDep) |
| ★ `vendor/leaflet/` | Leaflet 1.9.4 로컬 벤더링(leaflet.js 148KB + css) — CSP 대응 |
| ★ `icon.svg` `icon-192/512.png` `apple-touch-icon.png` `og-image.png` | 앱/OG 아이콘 |
| ★ `robots.txt` `sitemap.xml` | 크롤러 허용(+/api 차단)·사이트맵 |
| `manifest.webmanifest` `vercel.json` `index.html` `css/style.css` `guide.html` `dev-server.mjs` | 매니페스트 · 배포설정(함수 maxDuration·헤더·CSP·favicon 리다이렉트) · 진입점 · 스타일 · 가이드 · 로컬서버 |
| `img/subway-map.png` | 지하철 노선도 이미지(4.2MB, 커밋 대상) |

> **신규 기능 추가 절차**: `lib/xxx.js` 작성 → `api/[service].js`의 `HANDLERS`(+필요시 `CACHE`)에 등록 → 프론트에서 `/api/xxx?...` 호출. dev-server는 자동 라우팅.

---

## 4. 남은 작업

### 진행 대기 (외부 요인)
- [ ] **공단 실시간 주차면수** — 활용신청 승인(2026-07-08)에도 제공기관 백엔드 죽음(`Error forwarding request to backend server`). 코드·스냅샷 이미 붙어 있어(`lib/kotsa-parking.js`, `data/parking-kotsa.js`) 회복 시 `npm run build:parking` + `KOTSA_PARKING=1` 재배포만. 회복확인 `/api/parking?diag=1`. *왜 아직 안 함: 우리 코드 아닌 제공기관 장애.*
- [ ] **공공임대 단지(SH 포함)** — `myhome/rentalHouseList` 구현 완료했으나 ①키 미전파(code 30) ②마이홈이 Vercel IP 차단. 현재 `{pending:true}` degrade. *왜: 키 전파+IP 이슈 미해결. LH청약 탭 숨김 상태라 우선순위 낮음.*

### 선택 (여력 될 때)
- [ ] **스냅샷 신선도 자동화** — `night-clinics`·`parking-nationwide`·`ex-tollgates`는 수동 `npm run build:*`만 있고 크론 없음. GitHub Actions 월 1회 리빌드 검토. *왜: 원본 갱신주기 낮아 급하지 않음.*
- [ ] **택배 조회(CJ 무응답)·공공와이파이·관광 TourAPI·날씨(기상청)** — 활용신청 시 추가 가능. *왜: 신규 소스 우선순위 밀림.*
- [ ] **미사용 dead CSS 정리** — 숨긴 탭 관련 스타일 등. *왜: 기능 영향 없어 후순위.*

### 완료(기록 보존)
- [x] 주차장 전국 확대(2026-07-10) · 광주 지역코드 복구(2026-07-16, §7) · 야간진료 탭(2026-08) · 탭 6개 숨김(2026-08)

---

## 5. 실행 명령어

```bash
cd C:\Users\GB\Documents\gong-medical-app

# 로컬 개발 서버 (기본 3005, PORT로 변경)
node dev-server.mjs                 # → http://localhost:3005
PORT=3010 node dev-server.mjs

# 스냅샷 재생성 (원본 갱신·행정개편 시) → data/*.js 갱신 후 재배포 필요
npm run build:parking      # 전국 주차장
npm run build:clinics      # 야간진료 병의원 (E-Gen 전 페이지 스캔, 수분 소요)
npm run build:tollgates    # 고속도로 영업소 목록
npm run build:assets       # PWA 아이콘 + OG PNG (sharp)

# 문법 검사 (커밋 전 필수)
node --check js/services.js
node --check "api/[service].js"

# 배포 (cslis07 계정, CLI 직접)
vercel --prod --yes

# 프로덕션 스모크
curl -s "https://gong-medical-app.vercel.app/api/parking?lat=37.5663&lon=126.9779&limit=3"
```

### 커밋 전 검증 절차 (이 순서로)
1. `node --check`로 바뀐 JS 문법 검사
2. `node dev-server.mjs` + `curl`로 바뀐 엔드포인트/페이지 로컬 스모크
3. `gh auth status --active`로 **cslis07 확인** → `git commit` → `git push origin main`
4. `vercel --prod --yes` → **프로덕션에서 `curl`로 재확인**(로컬만 되고 프로덕션은 IP 차단되는 API가 흔함, §6-4)
5. 가능하면 브라우저 육안(콘솔 에러 0 + 핵심 인터랙션)

### 환경변수 (`.env` 로컬 + Vercel Production 양쪽 필요)

| 키 | 용도 | 설정 위치 |
|---|---|---|
| `DATA_API_KEY` | 실거래가·미세먼지·시내버스·LH·myhome·주차장 표준데이터·**야간진료(E-Gen)** (data.go.kr 계정키) | `.env` + Vercel |
| `SEOUL_API_KEY` | 지하철 정보·혼잡도·따릉이·주차장(서울 열린데이터) | `.env` + Vercel |
| `SEOUL_REALTIME_KEY` | 지하철 실시간 도착/위치(별도 키) | `.env` + Vercel |
| `OPINET_API_KEY` | 주유소(파라미터명 `certkey`) | `.env` + Vercel |
| `EX_API_KEY` | 고속도로(한국도로공사 data.ex.co.kr, 키 하나로 전 OpenAPI) | `.env` + Vercel |
| `VWORLD_API_KEY` | 지오코딩(Vercel에선 차단→Nominatim 폴백) | `.env` + Vercel |
| `KOTSA_PARKING` | 선택 토글. `"1"`이면 공단 실시간 주차면수 시도(기본 off, 백엔드 장애) | Vercel(선택) |

> ⚠️ 키 값 **절대 커밋 금지**. `.env`(gitignore) + `vercel env add <KEY> production`. env 변경 후 **반드시 재배포**.

---

## 6. 배포 관련 주의사항

1. **★ Vercel Hobby 함수 12개 제한** — `api/` 아래 파일 1개 = 함수 1개. 그래서 **`api/[service].js` 단일 catch-all**만 두고 실제 핸들러는 `lib/`에 둔다. 서비스가 14개여도 함수는 1개. **`api/`에 새 파일 만들지 말 것.**
2. **cslis07 계정 전용** — GitHub·Vercel 모두 cslis07. push 전 `gh auth status --active` 확인.
3. **env는 재배포해야 적용** — `vercel env add` 후 `vercel --prod --yes` 필수.
4. **외부 API의 데이터센터 IP 차단**이 흔함(§7). 신규 소스는 **반드시 프로덕션에서도 호출 검증**.
5. **커밋 대상 대용량 파일**: `img/subway-map.png`(4.2MB), `data/parking-nationwide.js`(4.5MB), `data/night-clinics.js`(≈10MB), `vendor/leaflet/`. `node_modules`는 gitignore. Vercel이 `package.json` deps(proj4, fast-xml-parser, sharp) 설치.
6. **런타임 제약**: `vercel.json` `maxDuration: 60`(Hobby 기본 10초). 라우터가 핸들러를 **동적 import**(대용량 스냅샷을 무관 요청 콜드스타트에서 파싱하지 않도록).
7. Deployment Protection 켜지면 외부 401. 현재 공개(200).

### 6.5 보안 (2026-07-10 감사 후 적용, 유효)

| 항목 | 조치 | 파일 |
|---|---|---|
| 쿼터 소진(오픈 프록시) — `/api/realestate` 1요청=RTMS 최대 30회 등 | 서비스별 CDN 캐시(`s-maxage`) + LH 날짜창 366일 제한 + subway 월통계 `pool(…,6)` | `api/[service].js`·`lib/lh.js`·`lib/subway.js` |
| CSP 부재 | `default-src 'self'` CSP + guide 인라인 스크립트 분리 | `vercel.json`·`js/guide.js` |
| `javascript:` 스킴(LH DTL_URL) | `safeUrl()` — `^https?://`만 링크 | `js/services.js` |
| 에러 원문·상위 본문 유출 | `errorMessage()`로 통일, 원문은 `console.error`만 | `lib/respond.js` + 전 핸들러 |

> **안전 확인**: 키는 전부 `process.env`에서만 URL에 삽입, 클라이언트 번들·에러에 없음. 진단 응답도 불리언만(`seoulKey: Boolean(...)`). SSRF 없음(호스트 상수 고정). **미적용(후속)**: IP 단위 rate limit(서버리스라 `@vercel/kv`/WAF 필요).

---

## 7. 최근 발생한 에러와 해결 방법

| 증상 | 원인 | 해결 |
|---|---|---|
| 배포 `Error`, 신규 `/api/*` 404 | Vercel Hobby 함수 12개 초과(api/에 13개) | 핸들러를 `lib/`로, `api/[service].js` catch-all 1개로 |
| 야간진료 스냅샷 15MB로 과대 | 43,384곳 × 객체 키 반복 + 진료과 긴 문자열 | **컬럼형(배열의 배열)** + 진료과 3개 컷 + 좌표 5자리 → ≈10MB. `lib/clinic.js`가 컬럼 인덱스로 읽음 |
| E-Gen 병의원 API가 Q0/Q1(지역) 무시 | 이 오퍼레이션은 지역·좌표 필터 미지원(전국 8만건 반환) | 주차장처럼 **빌드타임 스냅샷** 후 서버가 좌표 반경으로 필터 |
| 배포 직후 공유링크 복원 반쪽 | SW stale-while-revalidate가 index.html·JS를 다른 배포 버전으로 섞음(version skew) | **SW 네트워크 우선 전환**(오프라인만 캐시) + 문서 no-cache 재검증 |
| "필터 적용" 버튼 세로로 찌그러짐 | 4열 그리드 트랙 최소폭 합 > 카드 폭(grid item `min-width:auto`) | `.controls .field`에 `min-width:0` + 641~800px 2열 브레이크포인트 |
| 조회 실패·needKey인데 스켈레톤 잔존 | `!d.ok`/`needKey` 경로가 결과영역을 안 지움 | 전 패널 `endEmpty`/`retryBox`로 전환(스켈레톤 제거+재시도) |
| 광주 5개 구 전부 0건 | 전남광주통합특별시(2026-07-01)로 **시도 프리픽스 12 신설**(29·46 폐기) | 미사용 프리픽스×110 프로브로 12110(목포) 적중 → 광주 12210~12330 + 전남 5시 실증 복구 |
| 부천·화성·인천서구 거래 0건(오류 아님) | 행정구역 개편으로 LAWD_CD 변경, RTMS는 과거도 새 코드 재색인 | 부천 41192/4/6, 화성 41591/3/5/7, 인천 서해28275·검단28290 실조회 검증 |
| 미세먼지 예보 자주 빈 응답 | `getMinuDustFrcstDspth`는 `searchDate=오늘`이면 발표 전이라 0건 | 어제·오늘 발표 병합 후 대상일별 최신 발표 선택 |
| 미세먼지 예보 PM10/PM2.5 뒤섞임 | API가 InformCode 필터 무시하고 혼합 반환 | 응답에서 `informCode` 일치만 골라 사용 |
| 고속버스(KOBUS)·로또(dhlottery)·vworld·마이홈 `fetch failed` | **Vercel 데이터센터 IP 차단** | KOBUS 탭 제거·폴백 / 로또 CDN 미러 / vworld→Nominatim 폴백 / 마이홈 pending degrade |
| 고속도로 EX `400 Request Blocked` | EX 포털 봇 차단 | **User-Agent + Referer** 헤더 추가(Vercel IP는 허용) |
| OPINET `aroundAll` 빈 결과 | 파라미터명 `code` 아니라 **`certkey`** | `certkey` 수정 + KATEC proj4 변환. 좌표필드 `GIS_X_COOR`(D 없음) |
| 공단 주차 `Error forwarding request to backend server` | 승인됐으나 제공기관 백엔드 죽음(위조키는 Unauthorized로 구분) | 회복 대기, 빈 스냅샷 degrade |
| 표준데이터 전량수집 `NODATA_ERROR` 중단 | 좌표 없는 행 버려 `rows.length`가 `totalCount` 미달 | 종료조건을 수신건수로, `resultCode=03` 정상종료 |
| LH 7,590건 중 2,700건만 도착 | 40p `Promise.all` 동시투척 시 무응답 + `.catch(()=>[])`가 삼킴 | `lib/pool.js`(동시성 4) + `failedPages`로 노출 |
| 4.5MB 스냅샷이 모든 탭 콜드스타트 파싱 | 라우터 정적 import | 라우터 **동적 import** + 핸들러 내 지연 로드 |
| 로컬 dev-server 좀비 누적 | bash `kill %1`이 Windows detached node 못 죽임 | 매번 새 포트 + PowerShell `Win32_Process` CommandLine 필터로 `dev-server.mjs`만 종료 |
| 이 머신 `convert`가 ImageMagick 아님 | `C:\WINDOWS\system32\convert.exe`(NTFS 툴) | PNG 래스터화는 **sharp**로만(build-assets.mjs) |
| 홈인데 서브탭 줄이 그대로 보임 | `.subtabs{display:flex}`(작성자 스타일)가 UA의 `[hidden]{display:none}`을 이김 — JS로 `hidden=true`를 걸어도 화면엔 그대로 | CSS에 **`.subtabs[hidden]{display:none}`** 명시. ⚠️`el.hidden`만 JS로 읽으면 «감춰졌다»고 오판한다 — 반드시 `getComputedStyle().display`로 확인 |
| 지하철 노선도가 쪼그라듦(320px) | 홈이 첫 화면이 되며 노선도가 **숨은 채** 그려짐 → `scroll.clientWidth`가 0이라 `baseW`가 최소값으로 굳음 | `initMapZoom`이 `window.__refitSubwayMap` 노출, `switchPanel("subway")`에서 호출해 폭 재계산(+`resize` 리스너, 재렌더 시 옛 리스너 제거) |

---

## 8. API 구조

모든 프론트 호출 `/api/{service}?...` → `api/[service].js`가 `lib/{service}.js`로 위임.

| 경로 | 주요 파라미터 | 업스트림 · 특이사항 |
|---|---|---|
| `/api/subway` | `kind=mapData\|arrival\|position\|firstlast\|accessibility\|elevatorLift\|stats\|timeStats\|airquality\|closure\|shortestPath` | 서울 열린데이터(정보8088/실시간swopenapi). 열차위치는 1~9호선만 |
| `/api/gas` | `op=avg\|recent` \| `lat&lon&prodcd&radius` | Opinet. `certkey` 필수, KATEC 좌표. `recent`=최근7일 추이 |
| `/api/bike` | `lat&lon` | 서울 bikeList 3p + haversine |
| `/api/highway` | `op=rest\|congest\|sms\|tollgates\|traveltime` | EX(data.ex.co.kr). UA+Referer 필수. `sms`=realTimeSms 돌발, `traveltime`=realUnitTrtm(영업소코드 필요→ex-tollgates 스냅샷) |
| `/api/parking` | `lat&lon&live=1&free=1&page&size` \| `diag=1` | 서울 실시간 + 전국 스냅샷. 위치필터 없어 스냅샷 후 반경 |
| `/api/clinic` | `lat&lon&radius&limit` | E-Gen 스냅샷 반경 필터. **지역/좌표 필터 없어 스냅샷 필수**. '지금진료중'은 프론트 계산 |
| `/api/density` | `area=강남역` | citydata_ppltn(5분 주기, 새벽 미제공) |
| `/api/air` | `sido=서울` \| `op=metro` | 에어코리아. 예보는 어제·오늘 발표 병합, informCode 필터 |
| `/api/realestate` | `type=trade\|rent\|silv&lawd&ym` | RTMS 전량수집(동시성20, 상한30p). 행정개편 시 LAWD 하드코딩 갱신 |
| `/api/citybus` | `op=near\|arrival` | TAGO |
| `/api/lh` | `name&region&status&type&from&to` | LH(전량수집 동시성4, 상한40p) |
| `/api/myhome` | `brtc&signgu&size` | 마이홈(현재 pending, Vercel IP 차단) |
| `/api/geocode` | `q=주소` | vworld→실패시 Nominatim |

> **외부 의존 공통 함정**: ①대부분 일일 트래픽 1,000회 → CDN 캐시가 유일 방어선 ②위치/지역 필터 없는 API(주차장·야간진료·영업소)는 **빌드타임 스냅샷** 패턴 ③data.go.kr는 API별 활용신청 필요하나 이 계정은 위 전부 승인됨(E-Gen도 기존 키로 됨) ④EX는 키 하나로 전 OpenAPI.

---

## 9. ⛔ 하지 말 것

> 실행하면 되돌리기 어렵거나 데이터·키가 날아가는 것. 손대기 전 반드시 확인.

1. **`api/` 폴더에 새 파일 만들지 말 것** — Vercel Hobby 함수 12개 제한. 핸들러는 `lib/`에 두고 `HANDLERS`에 등록. (§6-1)
2. **API 키 절대 커밋 금지** — `.env`(gitignore) + `vercel env add`로만. env 변경 후 반드시 재배포. (§5)
3. **cslis07 계정 외로 push 금지** — push 전 `gh auth status --active` 확인. (§6-2)
4. **로컬만 검증하고 배포 금지** — 외부 API의 Vercel IP 차단이 흔함. 프로덕션 curl 필수. (§6-4, §7)
5. **에러 원문·상위 응답 본문을 사용자에게 반사 금지** — 키 유출 위험. `errorMessage()` 통일, 원문은 `console.error`만. (§6.5)
6. **미사용처럼 보여도 삭제 금지 파일**:
   - `lib/kotsa-parking.js`, `data/parking-kotsa.js` — 공단 백엔드 회복 시 켜짐(빈값 degrade 중).
   - `data/night-clinics.js`(10MB), `data/parking-nationwide.js`(4.5MB), `data/ex-tollgates.js` — **빌드 산출 스냅샷, 재생성 수분 소요**. 커밋 대상.
   - `lib/respond.js`의 `redact()` — 정의만·미사용이나 상위 본문 인용 대비 잔존.
   - **숨긴 탭 6개의 패널·핸들러**(citybus/realestate/lh/air/lotto/lost) — `data-off`로 숨김일 뿐. 삭제하면 복구 불가.
7. **홈 허브 카드를 `index.html`에 손으로 박지 말 것** — `renderHub()`가 `.toptab` 목록에서 만든다. HTML에 박으면 탭을 숨겼는데 홈 카드는 남는 «유령 진입로»가 생긴다. 카드 문구·색만 `js/services.js`의 `HUB` 표에서 고칠 것. (§2 홈 허브)
8. **`.subtabs` 안의 `.toptab` 버튼을 «안 보인다고» 지우지 말 것** — 2026-08-07부터 화면에 없지만(카테고리 바·서브탭 줄 제거) **홈 카드의 원본 목록이자 `data-off` 계약의 근거**다. 지우면 홈 화면이 통째로 빈다. 같은 이유로 `showCategory()`·`firstTabOfCat()`도 현재 미사용이지만 남겨 뒀다.
9. **행정구역 코드(`js/services.js` `LAWD`) 임의 수정 금지** — 실조회 검증 없이 바꾸면 조회 0건. 개편 시 §7 방식(프로브)으로 검증 후 반영.

---

## 10. ❌ 보류 / 구조적 한계 (재시도 방지)

- **공연 잔여석** — 인터파크 NOL 개편으로 이름검색이 SPA HTML만 반환, 유효 goodsCode 확보 불가. → 공개 API 없음.
- **대중교통 길찾기(ODsay)** — 키 발급 + 호출 IP 화이트리스트 필요. Vercel IP 유동이라 불가.
- **공공임대(마이홈)** — 마이홈이 Vercel 데이터센터 IP 차단(로컬만 됨). 키 전파 이슈까지 겹쳐 pending degrade.
- **공단 실시간 주차면수** — 제공기관 백엔드 장애(승인은 됨). 우리 코드로 해결 불가, 회복 대기.
- **IP 단위 rate limit** — 서버리스라 인메모리 카운터 부분적. `@vercel/kv`/WAF 필요해 보류(CDN 캐시로 대체 방어).
- **일부 외부 API의 Vercel IP 차단**(KOBUS·dhlottery·vworld·마이홈) — 구조적. 폴백(CDN 미러/Nominatim/공식링크)으로만 우회.
- **스냅샷 실시간성 한계** — 주차장·야간진료·영업소는 원본에 위치필터가 없어 스냅샷 방식. 진료시간·요금 등은 **빌드 시점 기준**(오래되면 부정확). UI에 기준일 표기, 갱신은 수동 `build:*`.

---

## 11. 디렉토리 구조

```
gong-medical-app/
├─ api/
│  └─ [service].js         # 단일 catch-all 라우터 (함수 1개)
├─ lib/                    # API 핸들러 14 + 유틸 3(kotsa-parking·pool·respond)
├─ js/                     # 프론트: app(지하철)·services(나머지)·favorites·map·pwa·theme·guide
├─ data/                   # 빌드 산출 스냅샷 (parking-nationwide·night-clinics·ex-tollgates·parking-kotsa)
├─ scripts/                # 스냅샷·자산 빌더 (build-parking/clinics/tollgates/assets)
├─ vendor/leaflet/         # Leaflet 로컬 벤더링 (CSP 대응)
├─ img/subway-map.png      # 지하철 노선도 이미지(4.2MB)
├─ index.html · css/style.css · guide.html
├─ sw.js · manifest.webmanifest · icon*.png · icon.svg · og-image.png · robots.txt · sitemap.xml
├─ vercel.json             # 함수 maxDuration·보안헤더·CSP·favicon 리다이렉트
├─ dev-server.mjs          # 로컬 서버(동일 라우터 경유)
├─ package.json            # deps: proj4·fast-xml-parser / devDeps: sharp
└─ .env                    # API 키 6종 (gitignore)
```
