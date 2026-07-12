# PROJECT_STATUS — 서울 교통·생활 정보 앱

> 최종 갱신: 2026-07-10 · 위치: `C:\Users\GB\Documents\gong-medical-app`
> 배포: cslis07/Vercel · 공개 URL: https://gong-medical-app.vercel.app
> GitHub: cslis07/gong-medical-app (main)

---

## 1. 프로젝트 목적

공공/공식 데이터로 **서울(수도권) 교통·생활 정보**를 한 화면에서 조회하는 무료 웹앱.
회원가입·로그인 없이, 상단 탭으로 12개 생활 서비스를 제공한다.

- **구조**: 순수 HTML + vanilla JS(빌드 없음) + **Vercel 서버리스 프록시**(API 키 은닉·CORS 우회·스크래핑)
- **원칙**: 예매·결제·개인정보 입력은 하지 않는다. 조회만 하고 결제/예매는 공식 페이지로 링크(handoff).
- **이력**: 공공의료 앱 → 지하철 전용 개편 → k-skill 참고해 생활서비스 확장 → data.go.kr/EX/OPINET 대량 확장
  → 2026-07-10 **영화관·고속/시외버스 탭 제거**(어차피 공식 페이지에서 예매해야 해 조회만으론 가치가 낮음).
  URL·Vercel 프로젝트명(`gong-medical-app`)은 하위호환을 위해 그대로 유지.
- **참고 소스**: NomaDamas/k-skill 문서(MCP를 그대로 쓰지 않고, 각 기능이 쓰는 **공개 API 엔드포인트만 참고**해 자체 이식).

---

## 2. 현재 구현된 기능 (탭 12종, 전부 라이브)

| 탭 | 기능 | 데이터 소스 | 사용 키 |
|---|---|---|---|
| 🚇 지하철 | 공식 노선도 → 역 검색 → 도착·위치·첫막차·최단경로·편의시설·승하차·공기질 종합 모달 | 서울 열린데이터 | SEOUL_API_KEY / SEOUL_REALTIME_KEY |
| 👥 혼잡도 | 서울 핫스팟 120여곳 실시간 인구·혼잡도·성별/연령 | citydata_ppltn | SEOUL_API_KEY |
| 🧳 분실물 | LOST112·서울교통공사 조회 조건 정리 + 공식 링크(안내형) | — | 불필요 |
| 🎰 로또 | 회차별 당첨번호·등위별 당첨금·내 번호 등수 계산 | smok95 CDN 미러 | 불필요 |
| ⛽ 주유소 | 내 위치/주소 반경 최저가 주유소(가격순)·주소·편의시설 + **전국 평균유가 바** | Opinet | OPINET_API_KEY |
| 🚲 따릉이 | 주변 대여소 실시간 자전거·거치대 수 | 서울 bikeList | SEOUL_API_KEY |
| 🛣️ 고속도로 | 휴게소(편의시설·대표메뉴·유가) / 실시간 정체·서행 구간 | 한국도로공사 EX | EX_API_KEY |
| 🏠 실거래가 | 아파트 **매매/전세/월세/분양권** · 가격·월세 필터 · 정렬 · 카드별 🗺️지도 · **전량 수집 + 페이지네이션** | 국토부 RTMS | DATA_API_KEY |
| 😷 미세먼지 | 시도별 측정소 PM10/PM2.5·등급·예보 + **측정소/등급 필터** + **헤더 수도권 평균 배지** | 에어코리아 | DATA_API_KEY |
| 🚏 시내버스 | 주변 정류소 → 정류소별 **실시간 도착**(노선·남은 정류장) | 국토부 TAGO | DATA_API_KEY |
| 🅿️ 주차장 | **전국 17,700여곳** 가까운 순 + 서울 일부 **실시간 잔여면수**·요금·운영시간 / 실시간·무료 필터 · **서버 페이지네이션** | 서울 GetParkInfo+GetParkingInfo · 전국주차장정보표준데이터(스냅샷) | SEOUL_API_KEY / DATA_API_KEY |
| 🏘️ 청약·임대 | LH 분양·임대 공고(**지역·상태 필터**, 상세링크, **전량 수집 + 페이지네이션**) / 공공임대 단지(LH·SH·지방) | LH · 마이홈 | DATA_API_KEY |

### 공통 기능 · UI
- **디자인 시스템**(2026-07-12): `css/style.css`가 전부 토큰(`--bg/--card/--surface-2/--accent/--ok-bg…`) 기반. 라이트/다크 자동(`prefers-color-scheme`) + 헤더 토글(`js/theme.js`, `localStorage`, auto→light→dark). 하드코딩 색 30여 곳을 토큰화해 다크가 한 곳에서 뒤집힌다.
- **카테고리 내비**: 12탭을 교통(지하철·시내버스·따릉이·고속도로)/주거(실거래가·LH·주차장)/생활(미세먼지·혼잡도·주유소·로또·분실물) 3그룹으로. `.catbar` 세그먼트 → `.subtabs`. `switchPanel(name)`이 해당 카테고리만 노출(`showCategory`).
- **로딩 스켈레톤**(`showSkeletons`)·**빈 상태 카드**(`endEmpty`)·**포커스 링**(`:focus-visible`)·**`prefers-reduced-motion`**·상태줄 `aria-live`.
- **탭 딥링크**: `#parking` 처럼 `location.hash`에 탭이 반영된다. 새로고침·링크 공유·뒤로가기 복원.
- **CDN 캐시**: `api/[service].js`의 `CACHE` 표가 서비스별 `s-maxage`를 정한다. 200이 아니거나 `{ok:false}`면 자동으로 `no-store`.
- **페이지네이션**(실거래가·주차장·LH): `renderPager()`(js/services.js) 공용 컴포넌트. `‹ 1 … 4 5 6 … 20 ›` 형태.
  - 실거래가·LH는 서버가 **전 페이지를 모아 주고** 클라이언트가 필터·정렬·페이징(20건/쪽). 필터를 바꾸면 1페이지로 복귀.
  - 주차장은 전국 17,000여곳이라 **서버가 `page`/`size`로 잘라 준다**(12건/쪽). 페이지 이동 시 좌표를 캐시해 위치를 다시 묻지 않는다.
- **위치 입력**: 브라우저 geolocation **또는 주소 입력**(`/api/geocode`). 주유소·따릉이·시내버스·주차장에 적용.
- **헤더 배지**: 수도권(서울·경기·인천) 183개 측정소 평균 PM10을 숫자+등급+색상으로 상시 표시(클릭 시 미세먼지 탭).
- 오류 시 🔄 다시 시도 박스, 모바일 최적화(바텀시트·탭 가로스크롤·44px 터치), 📖 `guide.html`.

---

## 3. 수정한 주요 파일

```
api/[service].js      ★ 단일 catch-all 라우터 (Vercel 함수 1개) → lib/ 위임
lib/*.js              ★ 실제 핸들러 13개 (아래)
  subway.js  density.js  lotto.js   gas.js       bike.js
  highway.js realestate.js air.js   citybus.js   parking.js
  lh.js      myhome.js   geocode.js
lib/kotsa-parking.js  공단 B553881 클라이언트(비핸들러 모듈, HANDLERS에 등록 안 함)
lib/pool.js           동시성 제한 + 재시도 유틸(전량 수집용, 비핸들러 모듈)
lib/respond.js        에러 응답 정제(원문·키 유출 차단) + redact (비핸들러 모듈)
js/guide.js           guide.html 전용 스크립트 (CSP 때문에 인라인에서 분리)
js/theme.js           라이트/다크 테마 부트스트랩 + 토글 (head에서 동기 로드, FOUC 방지)
data/parking-nationwide.js  전국 주차장 스냅샷 17,768곳 (4.5MB, 자동생성)
data/parking-kotsa.js       공단 시설+운영 스냅샷 (현재 빈 배열 — 백엔드 장애)
scripts/build-parking-snapshot.mjs  위 두 스냅샷 빌더 (`npm run build:parking`)
index.html            12개 탭 + 패널 + 헤더 미세먼지 배지
js/app.js             지하철 전용 로직(노선도·역 종합 모달)
js/services.js        나머지 13개 탭 로직 + 탭 전환 + 공용 getLocation(주소/GPS)
css/style.css         전체 스타일(.toptabs/.panel/.dust-badge/.lotto-ball 등)
dev-server.mjs        로컬 서버(동일 catch-all 라우터 경유)
guide.html            이용가이드
package.json          deps: fast-xml-parser, proj4
.env                  API 키 6종 (gitignore)
```

> **신규 기능 추가 절차**: `lib/xxx.js`에 핸들러 작성 → `api/[service].js`의 `HANDLERS`에 등록 → 프론트에서 `/api/xxx?...` 호출. (dev-server는 자동으로 라우팅됨)

---

## 4. 남은 작업

- [x] **주차장 전국 확대** (2026-07-10) — 전국주차장정보표준데이터로 17,768곳 커버. 스냅샷 방식(§9).
- [ ] **공단 실시간 주차면수** — 한국교통안전공단 `B553881/Parking`은 **활용신청 승인됨(2026-07-08)에도 제공기관 백엔드가 죽어 있다**(`Error forwarding request to backend server`). 코드·스냅샷 빌드는 이미 붙어 있으니(`lib/kotsa-parking.js`, `data/parking-kotsa.js`) 백엔드가 살아나면 `npm run build:parking` + `KOTSA_PARKING=1` 재배포만 하면 켜진다. 회복 확인: `/api/parking?diag=1`
- [ ] **공공임대 단지(SH 포함)** — `data.myhome.go.kr/rentalHouseList` 구현 완료했으나 ① 키가 마이홈 엔드포인트에 미전파(code 30) ② 마이홈이 Vercel IP 차단(fetch failed). 현재 "pending" 안내로 degrade. 전파 후 재확인 필요. `signguCode`(시군구, 마이홈 자체 코드) 필수 여부도 함께 확인.
- [ ] **광주 지역코드 복구** — 전남광주통합특별시 출범으로 5개 구 LAWD_CD가 전부 무효(전부 0건). 새 코드를 못 찾아 실거래가 지역 목록에서 제외한 상태. [행안부 행정구역 코드 변경 안내](https://business.juso.go.kr/jsi/jsiAreaCode)에서 확인 후 `LAWD`(js/services.js)에 되살릴 것.
- [ ] **브라우저 육안 검증** — Chrome 확장이 끊겨 최근 개선(실거래가 필터/지도·페이지네이션, 미세먼지 필터·배지, LH 필터, 주차장 탭)은 **API·배포파일 레벨로만 검증**됨.
- [ ] (보류) **공연 잔여석** — 인터파크가 NOL로 개편되며 이름검색이 SPA HTML만 반환, 유효 goodsCode 확보 불가.
- [ ] (보류) **대중교통 길찾기(ODsay)** — 키 발급 + 호출 IP 화이트리스트 필요(Vercel IP 유동).
- [ ] (선택) 택배 조회(CJ 무응답), 공공와이파이, 관광 TourAPI, 날씨(기상청 단기예보) — 활용신청 시 추가 가능.
- [ ] (선택) 미사용 dead CSS 정리, OG 이미지(1200×630).

---

## 5. 실행 명령어

```bash
cd C:\Users\GB\Documents\gong-medical-app

# 로컬 개발 서버 (기본 3005, PORT로 변경 가능)
node dev-server.mjs                 # → http://localhost:3005
PORT=3010 node dev-server.mjs

# 주차장 스냅샷 재생성 (표준데이터 38페이지 + 공단 시도) → data/*.js 갱신 후 재배포 필요
npm run build:parking

# 배포 (cslis07 계정, CLI 직접)
vercel --prod --yes

# 문법 검사
node --check lib/parking.js
node --check "api/[service].js"

# 핸들러 단독 테스트 (dev-server 없이)
SEOUL_API_KEY=$(grep '^SEOUL_API_KEY=' .env | cut -d= -f2) \
  node -e "import('./lib/parking.js').then(m=>m.default({query:{lat:'37.5663',lon:'126.9779'}},{status:c=>({json:o=>console.log(JSON.stringify(o).slice(0,300))})}))"

# 프로덕션 스모크
curl -s "https://gong-medical-app.vercel.app/api/parking?lat=37.5663&lon=126.9779&limit=3"
```

### 환경변수 (`.env` 로컬 + Vercel Production 양쪽 필요)
```
SEOUL_API_KEY        # 지하철·혼잡도·따릉이·주차장 (서울 열린데이터 계정키)
SEOUL_REALTIME_KEY   # 지하철 실시간 도착/위치 (별도 키)
DATA_API_KEY         # 실거래가·미세먼지·시내버스·LH·myhome·주차장 표준데이터/공단 (data.go.kr 계정키, 9ae13365…)
KOTSA_PARKING        # 선택. "1"이면 공단 실시간 주차면수 조회 시도. 기본 off(백엔드 장애 중)
OPINET_API_KEY       # 주유소 (파라미터명 certkey)
EX_API_KEY           # 고속도로 (한국도로공사 data.ex.co.kr)
VWORLD_API_KEY       # 지오코딩 (Vercel에선 차단 → Nominatim 폴백)
```
> ⚠️ 키 값은 **절대 커밋 금지**. `.env`(gitignore) + `vercel env add <KEY> production`으로만 관리.
> env 변경 후에는 **반드시 재배포**해야 반영된다.

---

## 6. 배포 관련 주의사항

1. **★ Vercel Hobby 함수 12개 제한** — `api/` 아래 파일 1개 = 서버리스 함수 1개다. 13개가 되자 배포가 `Error`로 실패했다. 그래서 **`api/[service].js` 단일 catch-all**만 두고 실제 핸들러는 `lib/`에 둔다. **`api/`에 새 파일을 만들지 말 것.**
2. **cslis07 계정 전용** — GitHub·Vercel 모두 cslis07. push 전 `gh auth status --active` 확인.
3. **env는 재배포해야 적용** — `vercel env add` 후 `vercel --prod --yes` 필수.
4. **외부 API의 데이터센터 IP 차단**이 흔하다. 아래 §7 참고. 신규 소스 붙일 때 **반드시 프로덕션에서도 호출 검증**할 것(로컬만 되는 경우가 많음).
5. `img/subway-map.png`(4.2MB)와 `data/parking-nationwide.js`(4.5MB)는 **커밋 대상**, `node_modules`는 gitignore. Vercel이 `package.json`으로 deps(proj4, fast-xml-parser) 설치.
6. Deployment Protection이 켜지면 외부 접속 401. 현재 공개(200).
7. **`api/`에 새 파일 금지**(1번)이므로 주차장 보조 모듈은 `lib/kotsa-parking.js`에 둔다. `api/[service].js`의 `HANDLERS`는 명시적 맵이라 lib에 파일을 더해도 함수 수는 그대로다.

---

## 6.5 보안 (2026-07-10 감사 후 적용)

| 항목 | 조치 | 파일 |
|---|---|---|
| **쿼터 소진(오픈 프록시)** — `/api/realestate` 1요청 = RTMS 최대 30회, `/api/lh` 40회, `subway?kind=stats` 31회. 인증이 없어 `curl` 33회면 하루치 소진 | ① 서비스별 **CDN 캐시**(`s-maxage`)로 동일 요청이 상위로 안 나감 ② LH `from`/`to`를 `^\d{8}$` + **최대 366일** 창으로 제한 ③ subway 월통계를 `pool(…, 6)`로 묶음 | `api/[service].js` · `lib/lh.js` · `lib/subway.js` |
| **CSP 부재** | `default-src 'self'` 기반 CSP 추가. `script-src 'self'`를 걸기 위해 guide.html의 인라인 `<script>`와 `onclick` 10개를 `js/guide.js`로 분리 | `vercel.json` · `js/guide.js` |
| **`javascript:` 스킴** — LH `DTL_URL`을 `href`에 그대로 삽입. `E()`는 속성 탈출만 막고 스킴은 못 막는다 | `safeUrl()` — `^https?://`만 링크로 렌더, 아니면 `<article>` 폴백 | `js/services.js` |
| **에러 원문 유출** — `String(err.message)`·상위 응답 본문(`_raw`, `t.slice()`)을 그대로 반사 | `errorMessage()`로 통일. 원문은 `console.error`(Vercel 함수 로그)로만, 사용자에겐 고정 문구 | `lib/respond.js` + 전 핸들러 |
| **죽은 sanitizer** — `sanitizeHtml()`·`dec()`가 호출처 없이 남아 있어 되살아나면 위험 | 제거 | `js/app.js` |
| **`.env.example` 낙후** — 실제 쓰는 키 6종 중 3종 누락 | 6종 전부 + 용도·함정 명시 | `.env.example` |

> **확인된 안전 항목**: 키는 전부 `process.env`에서만 URL에 삽입되고 클라이언트 번들·에러에 없다. `git log` 전 이력에 실제 키 흔적 없음(`.env`는 미추적). SSRF 없음 — 모든 핸들러가 호스트를 상수로 고정하고 사용자 입력은 `encodeURIComponent`/`URLSearchParams`로만 넣는다.
>
> **미적용(후속)**: IP 단위 rate limit. 서버리스라 인메모리 카운터는 부분적이고 `@vercel/kv` 또는 Vercel WAF가 필요하다. Origin/Referer 화이트리스트는 문서화된 `curl` 스모크 테스트를 깨뜨려 보류했다.

---

## 7. 최근 발생한 에러와 해결 방법

| 증상 | 원인 | 해결 |
|---|---|---|
| 배포 `Error`, 신규 `/api/*` 전부 **404 NOT_FOUND** | **Vercel Hobby 함수 12개 초과**(api/에 13개) | 핸들러를 `lib/`로 옮기고 `api/[service].js` catch-all 1개로 통합 |
| 고속버스(KOBUS) `fetch failed` → `connect ETIMEDOUT` *(탭 제거됨, 교훈 보존)* | KOBUS가 **Vercel 데이터센터 IP 차단**(TLS 아님). `node:https`로 바꾸니 진짜 원인이 드러남 | 해결 불가 → 도달 실패 감지 시 `{blocked:true}` 반환, 프론트는 **공식 예매 링크 카드**로 폴백 |
| 로또 dhlottery 302 → 홈으로 | dhlottery가 해외/데이터센터 IP 차단 | **공개 CDN 미러**(smok95.github.io/lotto) 프록시로 우회 |
| vworld 지오코딩 프로덕션 `fetch failed` | vworld도 Vercel IP 차단(로컬은 정상) | **Nominatim(OSM) 폴백** 추가. vworld 실패 시 자동 전환 |
| 고속도로 EX API `400 Request Blocked` | EX 포털 **봇 차단** | **User-Agent + Referer** 헤더 추가하면 정상(Vercel IP는 허용됨) |
| OPINET `aroundAll` 빈 결과 | 파라미터명이 `code`가 아니라 **`certkey`** | `certkey`로 수정. KATEC 좌표는 **proj4 + Opinet 공식 def**로 변환 |
| 공단 주차 API `Error forwarding request to backend server` | ~~심의 승인 전~~ → **오진이었다.** 2026-07-08 승인 후에도 동일. 위조키는 `Unauthorized`, 정상키는 이 메시지 ⇒ 게이트웨이 인증은 통과하고 **제공기관 백엔드가 죽은 것** | 회복 대기. `lib/kotsa-parking.js`가 실패를 정상 경로로 취급(빈 스냅샷 + 실시간 null). `/api/parking?diag=1`로 회복 확인 |
| 표준데이터 전량 수집이 `NODATA_ERROR`로 중단 | 좌표 없는 행(762건)을 버려서 `rows.length`가 `totalCount`에 영원히 도달 못 함 → 마지막 페이지를 넘어감 | 종료 조건을 **수신 건수**로 세고, `resultCode=03`은 정상 종료로 처리 |
| 표준데이터 `numOfRows=1000` 페이지 타임아웃 | 응답이 30초를 넘김 | `PER_PAGE=500` + 3회 재시도(백오프) |
| 서울 주차장이 118곳뿐 | 2,206행 중 **LAT/LOT가 0인 행이 대부분**. 좌표 보유 고유 PKLT_CD는 118곳 (문서의 "고유 852"는 좌표 없는 것 포함) | 정상. 나머지 서울 공영은 표준데이터가 좌표를 갖고 있어 병합으로 메움 |
| (설계 함정) 서울 공영을 뭉텅이로 중복 제거하면 663곳 증발 | 표준데이터 서울 공영 762곳 중 서울 소스와 실제 충돌은 **99곳뿐** | "주소=서울 & 공영이면 버림" 규칙 폐기 → **이름(괄호·공백·접미어 제거) 일치 + 200m 이내**만 중복 처리 |
| 주차장 "남대문 화물"이 4번 중복 | **노상주차장은 구획(1면)마다 행이 하나** (2,206행 / 고유 PKLT_CD 852) | `PKLT_CD`로 묶어 **TPKCT 합산**. 실측으로 다중행 그룹 65개가 전부 `TPKCT=1`, 큰값 중복 0임을 확인 후 적용 |
| 주차장 잔여면수가 엉뚱하게 표시 | 실시간 123행 중 **14행은 갱신시각이 빈 값** | `NOW_PRK_VHCL_UPDT_TM`이 있는 **109곳만 실시간으로 신뢰** |
| 마이홈 `code 30` / `fetch failed` | 키 미전파 + 마이홈이 Vercel IP 차단 | `{pending:true}` 안내로 degrade(화면 깨짐 방지). 전파 후 재확인 |
| 티머니 `errorCont` 오류 페이지 *(탭 제거됨)* | `bef_Aft_Dvs=D`, `req_Rec_Num=10` 누락(사이트 JS가 붙임) | 두 파라미터 필수 포함 |
| 실거래가 "전월세"가 한 덩어리 | API가 전세/월세를 `kind`로만 구분 | UI를 **매매/전세/월세/분양권**으로 분리, `kind`로 클라 필터 |
| 실거래가·LH가 100건만 나옴 | 첫 페이지만 호출했다(`pageNo=1`, `PG_SZ=100`) | `totalCount`(RTMS) / 행의 `ALL_CNT`(LH)로 총 페이지를 계산해 **전량 수집** |
| LH 전량 수집 시 7,590건 중 2,700건만 도착 | 40페이지를 `Promise.all`로 한 번에 던지면 **13페이지가 무응답**. `.catch(()=>[])`가 조용히 삼켜 데이터가 말없이 사라짐 | `lib/pool.js`(동시성 4 + 재시도 1회). 실패 페이지는 응답의 `failedPages`로 **드러낸다** |
| 실거래가 응답이 10초 초과 | RTMS는 호출 1건이 5~9초. 17페이지면 기본 동시성으론 17초 | RTMS는 병렬에 강하므로 동시성 20. 더해 `vercel.json`에 `maxDuration: 60`(Hobby 기본 10초) |
| 부천·화성·인천 서구가 **거래 0건** (오류 아님, `resultCode=000`) | **행정구역 개편으로 LAWD_CD가 바뀜.** RTMS는 과거 거래도 새 코드로 재색인한다 | 부천→41192/41194/41196, 화성→41591·41593·41595·41597(만세·효행·병점·동탄), 인천 서구→28275(서해구)·28290(검단구). 전부 실제 조회로 검증 |
| 광주 5개 구 전부 0건 | 전남광주통합특별시 출범(2026-07-01)으로 시도코드 변경 추정. 46/53~57 접두어 스캔에도 안 잡힘 | **미해결.** 지역 목록에서 제외. 행안부 코드표 확인 필요 |
| 코드 스캔 중 `API tok…` 응답 | 60개를 동시에 던져 data.go.kr **트래픽 제한** 발동 | 프로브는 소량·순차로 |
| 지하철 실내공기질 등급이 미세먼지 탭과 어긋남 | `app.js`의 `airLevel()`이 **3단계**(나쁨>35), 나머지는 환경부 **4단계** ⇒ PM2.5 100이 한쪽은 "나쁨", 다른 쪽은 "매우나쁨" | 4단계로 통일(≤15/≤35/≤75/초과). 분포 카운터·`airFilter` 옵션도 함께 확장 |
| 주차장 검색 버튼이 이벤트 객체를 페이지 번호로 넘김 | `addEventListener("click", searchParking)` — `searchParking(page)`의 첫 인자로 `PointerEvent`가 들어감 | `() => searchParking(1)`로 감쌈 |
| 4.5MB 스냅샷이 **모든 탭** 콜드스타트에서 파싱 | 라우터가 13개 핸들러를 정적 import → `parking.js`가 스냅샷을 최상위 import | 라우터를 **동적 import**로, `parking.js`도 스냅샷을 호출 시 지연 로드 |
| 주유소 "셀프" 칩이 항상 안 뜸 | Opinet `aroundAll`·`detailById` **어디에도 셀프 여부 필드가 없다**(`SELF_YN` 부재). 과거 `selfYn`은 늘 false | 셀프 칩·필드 제거. 대신 **브랜드 필터**(POLL_DIV_CD, 실제 존재)로 대체 |
| 미세먼지 PM2.5 예보가 PM10과 뒤섞임 | 에어코리아 `getMinuDustFrcstDspth`가 **InformCode 필터를 무시**하고 PM10·PM2.5·O3를 한 응답에 섞어 준다(items[0]가 PM10일 수 있음) | 응답에서 `informCode` 일치 항목만 골라 `informData` 최신 발표 선택. `mkFc(j, code)` |
| 로컬 dev-server 프로세스가 좀비로 누적 | bash `kill %1`이 Windows에서 detached node를 못 죽임 → stale 서버가 옛 코드로 응답 | 검증은 매번 새 포트로. 정리는 PowerShell `Win32_Process` CommandLine 필터로 `dev-server.mjs`만 종료 |

---

## 8. API 구조

모든 프론트 호출은 `/api/{service}?...` → **`api/[service].js`가 `lib/{service}.js`로 위임**.

### 서비스별 엔드포인트

| 경로 | 주요 파라미터 | 업스트림 |
|---|---|---|
| `/api/subway` | `kind=mapData\|arrival\|position\|firstlast\|accessibility\|elevatorLift\|stats\|timeStats\|airquality\|closure\|shortestPath` | 서울 열린데이터(정보 8088 / 실시간 swopenapi) |
| `/api/density` | `area=강남역` | `citydata_ppltn` |
| `/api/lotto` | `round=latest\|1231` | smok95.github.io/lotto |
| `/api/gas` | `op=avg` \| `lat&lon&prodcd=B027&radius` | Opinet `avgAllPrice` / `aroundAll`+`detailById` (certkey, KATEC) |
| `/api/bike` | `lat&lon` | 서울 `bikeList` 3페이지 + haversine |
| `/api/highway` | `op=rest&q=죽전` \| `op=congest` | EX `restConvList`+`restBestfoodList`+`curStateStation` / `trafficAmountByCongest` (UA+Referer 필수) |
| `/api/realestate` | `type=trade\|rent\|silv&lawd=11680&ym=202606` | 국토부 RTMS (rent는 `kind`로 전세/월세 구분) — **전량 수집**(동시성 20, 상한 30p=3,000건) |
| `/api/air` | `sido=서울` \| `op=metro` | 에어코리아 `getCtprvnRltmMesureDnsty` + `getMinuDustFrcstDspth`(PM10·**PM2.5** 예보, 코드 필터링) (metro=서울·경기·인천 평균) |
| `/api/citybus` | `op=near&lat&lon` \| `op=arrival&city&node` | TAGO `getCrdntPrxmtSttnList` / `getSttnAcctoArvlPrearngeInfoList` |
| `/api/parking` | `lat&lon&live=1&free=1&limit` \| `diag=1` | 서울 `GetParkInfo`+`GetParkingInfo`(실시간) + 전국 스냅샷 + 공단 스냅샷(현재 빈값) — 이름+200m로 중복 제거 후 거리순 |
| `/api/lh` | `name&region&status&type&from&to` | LH `B552555/lhLeaseNoticeInfo1` (응답이 배열/dsList 중첩 → 방어적 탐색) — **전량 수집**(동시성 4, 상한 40p) |
| `/api/myhome` | `brtc=11&signgu&size` | 마이홈 `rentalHouseList` (LH+SH+지방) — **현재 pending** |
| `/api/geocode` | `q=서울 강남구 테헤란로 152` | vworld `getcoord`(도로명→지번) → 실패 시 **Nominatim** |

### 핵심 구현 노트
- **KATEC 변환(주유소)**: `proj4('WGS84', '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43', [lon,lat])`
- **EX(고속도로)**: `data.ex.co.kr/openapi/...?key=&type=json` + **UA·Referer 헤더 필수**. `stdRestNm`/`serviceAreaName`은 **부분 매칭** 지원.
- **주차장 집계**: 노상은 구획별 행 → `PKLT_CD` 그룹, `capacity = Σ TPKCT`, 좌표는 가장 가까운 구획 것 사용. 실시간은 `NOW_PRK_VHCL_UPDT_TM` 있는 행만.
- **주차장 스냅샷**: 표준데이터·공단 API 모두 **위치 필터가 없어 전량 페이징만 가능**한데 일일 트래픽이 1,000회다(전량 1회 = 38페이지). 런타임 호출 시 콜드스타트 스물몇 번에 한도 소진 ⇒ 빌드 타임에 굽는다. 갱신은 `npm run build:parking` 후 재배포. 원본 갱신주기도 일 1회.
- **공단 API 조인 불가**: 표준데이터 `prkplceNo`와 공단 `prk_center_id`는 **다른 체계**라 ID 조인이 안 된다. 공단 실시간(`PrkRealtimeInfo`)을 쓰려면 좌표를 가진 공단 시설정보(`PrkSttusInfo`)를 함께 스냅샷해야 한다.
- **LH 기본 조회창은 최근 2개월**이다. 날짜를 안 주면 응답의 `dsSch`에 `PAN_ST_DT`/`PAN_ED_DT`가 2개월치로 찍혀 나온다(≈745건). `from`/`to`로 넓히면 2024-01-01부터 7,590건이지만 40페이지 상한에서 잘린다.
- **전량 수집 동시성**: RTMS는 병렬에 강하고(20 동시) LH는 약하다(4 동시). 같은 data.go.kr이어도 제공기관 서버마다 다르다. 새 소스에 `pool()`을 붙일 땐 반드시 **누락 없는지 총 건수와 대조**할 것.
- **TAGO 시내버스**: `arrtime`(초)→분, `arrprevstationcnt`=남은 정류장. `cityCode`+`nodeId`로 도착 조회.
- **subwayId 코드**: 1001~1009=1~9호선, 1063 경의중앙, 1065 공항, 1067 경춘, 1075 수인분당, 1077 신분당, 1092 우이신설, 1093 서해, 1032 GTX-A
