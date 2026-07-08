# PROJECT_STATUS — 서울 교통·생활 정보 앱

> 최종 갱신: 2026-07-07 · 위치: `C:\Users\GB\Documents\gong-medical-app`
> 배포: cslis07/Vercel · 공개 URL: https://gong-medical-app.vercel.app

---

## 1. 프로젝트 목적

공공/공식 데이터로 **서울 교통·생활 정보**를 한 화면에서 조회하는 무료 웹앱.
상단 **5개 서비스 탭**: 🚇 지하철 · 👥 혼잡도 · 🎬 영화관 · 🚌 버스 · 🧳 분실물.

- **구조**: 순수 HTML + vanilla JS + Vercel 서버리스 프록시(키 은닉·CORS·스크래핑)
- **회원가입/로그인 없음**
- **이력**: 공공의료 앱 → (2026-07-07) 지하철 전용 개편 → (2026-07-07) k-skill 문서 참고해 생활서비스 4종 추가(혼잡도·영화관·버스·분실물). URL·Vercel 프로젝트(gong-medical-app) 유지.
- **참고 소스**: NomaDamas/k-skill 문서(`C:\Users\GB\Downloads\Compressed\k-skill-main.zip`). MCP/스킬을 그대로 쓰지 않고, 각 기능이 쓰는 공개 API·엔드포인트만 참고해 기존 Vercel 방식으로 자체 이식.

---

## 2. 서비스별 상태

| 탭 | 데이터 소스 | 서버리스 | 상태 |
|---|---|---|---|
| 🚇 지하철 | 서울 열린데이터·서울교통공사 | `api/subway.js` | ✅ 라이브 (노선도+역 종합 모달) |
| 👥 혼잡도 | 서울 citydata_ppltn (SEOUL_API_KEY 재사용) | `api/density.js` | ✅ 라이브 (핫스팟 120여곳, 추정인구·성별·연령) |
| 🎬 영화관 | mcp.aka.page (CGV·메가박스·롯데, 키 불필요) | `api/cinema.js` | ✅ 라이브 (영화관/상영작/시간표·잔여석) |
| 🚌 시외버스 | 티머니 intercitybus (스크래핑) | `api/bus.js` type=intercity | ✅ 라이브 (터미널409·시간표·운수사·등급·잔여석) |
| 🚌 고속버스 | KOBUS (스크래핑) | `api/bus.js` type=express | ⚠️ **Vercel IP 차단** → 공식 링크 폴백 |
| 🧳 분실물 | LOST112·서울교통공사 | (프론트 전용) | ✅ 안내형 (조건 정리 + 공식 조회 링크) |
| 🎰 로또 | dhlottery(IP차단)→smok95 CDN 미러 | `api/lotto.js` | ✅ 라이브 (당첨번호·등위별 당첨금·내번호 등수계산) |

### 📋 2차 요청(생활서비스.txt 확장) 진행상황 — 2026-07-07
추가 요청 6종 중:
- ✅ **로또** 완료(dhlottery IP차단 → 공개 CDN 미러 smok95.github.io/lotto 프록시. 키 불요) · `api/lotto.js`
- ✅ **주유소(OPINET)** 완료·배포·검증(2026-07-07). `api/gas.js`: 브라우저 geolocation(WGS84)→proj4 KATEC(Opinet 공식 def `+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43`)→aroundAll.do(가격순)+detailById.do(주소·편의시설). 키 param=`certkey`. **OPINET은 Vercel IP 차단 안 함(KOBUS와 달리 정상)**. 검증: 강남역 3km→서초/강남 실제 주유소 가격순. env `OPINET_API_KEY`(Production 등록완료 + 로컬 .env). 무료 1,500호출/일. proj4 의존성 추가.
- ⏳ **주차장** — 사용자가 활용신청함(2026-07-07). **한국교통안전공단 주차정보 API(B553881), 처리상태 "신청"·심의여부 "심의" = 승인 대기 중**(자동승인 아님). End Point `https://apis.data.go.kr/B553881/Parking`, 기능 `/PrkSttusInfo`(시설·주소·위치)·`/PrkOprInfo`·`/PrkRealtimeInfo`(실시간 주차면). 참고문서 `주차정보시스템_기술문서_수정본_20240702.docx`. 승인 후 구현. (기존 tn_pubr API가 아니라 이 API로 진행)
- ⏳ **화장실(data.go.kr)** — localdata CSV 다운로드 깨짐(error.html) → data.go.kr 공중화장실 표준 API 활용신청 후 구현
- ❌ **공연 잔여석** — 인터파크가 NOL로 개편, 이름검색 API가 SPA HTML만 반환·유효 goodsCode 확인 불가. YES24 axPerf도 리다이렉트. 신뢰성 구현 보류(참고: k-skill 스크립트 엔드포인트는 api-ticketfront.interpark.com/v1/goods/{id}/playSeq + .../PlaySeq/{seq}/REMAINSEAT)
- ⏸️ **대중교통 길찾기(ODsay)** — 1차에서 제외 유지(ODsay 키+IP화이트리스트)
- ✅ **따릉이** 완료(2026-07-07) — `api/bike.js`, 서울 bikeList 3페이지 병렬+haversine, 기존 SEOUL_API_KEY 재사용. 검증: 강남역 주변 2732개
- ✅ **주유소 전국 평균유가** 추가 — gas.js `?op=avg`(avgAllPrice), 주유소 탭 상단 표시

### 📋 3차 확장 요청(2026-07-07) — 키 제공자별 대기목록
사용자 요청: 제안기능 전부 + 휴게소폴더(EX·OPINET) + 아파트실거래가/LH/SH. 키별 분류:
- **OPINET(키 보유)**: ✅평균유가 추가. 추가가능=지역별최저가top20(lowTop20.do)·고속도로 주유소가격 등
- **EX 키 필요(data.ex.co.kr 별도 발급)**: 휴게소 편의시설(`data.ex.co.kr/openapi/restinfo/restConvList`)·푸드메뉴(`restBestfoodList`)·고속도로주유소가격(restBestOilList)·실시간교통. 파라미터 key+type 필수. **사용자 EX키 발급 필요**
- **data.go.kr 활용신청 필요(기존 DATA_API_KEY 재사용, 대부분 자동승인)**: 날씨(기상청 단기예보)·미세먼지(에어코리아)·시내버스(TAGO 버스도착)·아파트실거래가(국토부)·LH청약·공공와이파이·관광TourAPI·화장실. 주차장=심의 대기중
- **SH**: i-sh.co.kr 또는 data.seoul.go.kr SH임대 확인 필요(SEOUL키 재사용 가능성)
- **미해결**: 택배(CJ 응답없음), 공연(NOL개편), KTX/SRT(코레일 로그인—TAGO 열차정보로 시간표만 가능)

> 키 확보 시 추가 예정 env: `OPINET_API_KEY`(주유소). 주차장·화장실은 기존 `DATA_API_KEY`에 API 활용신청만 추가하면 재사용. '근처' 기능은 브라우저 geolocation(navigator.geolocation, WGS84) 사용 예정.

### ⚠️ 고속버스(KOBUS) Vercel 차단 — 중요
- KOBUS(www.kobus.co.kr, 211.205.100.209)가 **Vercel 데이터센터 IP를 차단**(`connect ETIMEDOUT`). 로컬 Node에서는 정상.
- 처음엔 `fetch failed`(전역 fetch가 KOBUS 레거시 TLS에서 실패로 보였음) → `node:https`+완화 cipher(`DEFAULT@SECLEVEL=0`)로 바꾸니 진짜 원인이 **IP 타임아웃**으로 드러남. TLS 문제 아님, IP 차단이라 서버리스에서 해결 불가.
- 대응: `api/bus.js`가 도달 실패(`isUnreachable`) 시 `{blocked:true}` 반환 → 프론트가 **공식 KOBUS 예매 링크 카드**로 우아하게 폴백. (시외버스 티머니는 차단 없이 정상.)
- 향후 KOBUS 라이브가 꼭 필요하면: 별도 프록시(차단 안 되는 호스트) 경유 또는 공공데이터포털 대체 API 검토.

---

## 3. 수정/추가 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 상단 5개 서비스 탭 + 5개 패널(지하철·혼잡도·영화관·버스·분실물) |
| `js/app.js` | 지하철 로직(기존) — 노선도·역 종합 모달 |
| `js/services.js` | **신규** — 탭 전환 + 혼잡도·영화관·버스·분실물 프론트. helper는 app.js와 이름 충돌 피해 `byId`/`E` 사용 |
| `api/subway.js` | 지하철 프록시(기존) |
| `api/density.js` | **신규** — citydata_ppltn 혼잡도 |
| `api/cinema.js` | **신규** — mcp.aka.page 영화관 프록시(chain/op) |
| `api/bus.js` | **신규** — KOBUS·티머니 터미널+시간표. KOBUS는 node:https(레거시 TLS)+차단 폴백 |
| `css/style.css` | `.toptabs/.panel/.field.grow/.bed.busy/.busrow/.lost-table` 등 추가 |
| `guide.html` | 생활서비스 섹션(#sec-life)·TOC·변경이력 추가 |
| `dev-server.mjs` | `/api/density`,`/api/cinema`,`/api/bus` 라우팅 추가 |

---

## 4. 실행/배포

```bash
cd C:\Users\GB\Documents\gong-medical-app
node dev-server.mjs          # → http://localhost:3005 (로컬은 KOBUS도 동작)
vercel --prod --yes          # 배포 (cslis07, CLI 직접)
```

### 환경변수 (Vercel + .env)
```
SEOUL_API_KEY=...       # 지하철 정보/통계/시설 + 혼잡도(citydata_ppltn) 공용
SEOUL_REALTIME_KEY=...  # 지하철 실시간 도착/위치
```
> 영화관·버스는 키 불필요(공개 API/스크래핑). DATA_API_KEY(구 의료용)는 미사용.

---

## 5. 검증 (2026-07-07)
- 로컬 dev + **실제 브라우저(Chrome MCP)**로 5개 탭 전부 확인.
- 프로덕션 API: density✓ cinema✓ 시외버스 터미널409·시간표20편✓ / 고속버스 blocked→링크폴백✓(브라우저 확인).
- 지하철 노선도·혼잡도 카드·영화관·분실물 안내 렌더 확인.

---

## 6. API 엔드포인트 요약

- `GET /api/density?area=강남역` → 혼잡도 rows(level·pplMin/Max·성별·연령)
- `GET /api/cinema?chain=cgv|megabox|lottecinema&op=theaters|movies|timetable|seats&keyword=&playDate=YYYYMMDD`
- `GET /api/bus?type=express|intercity&op=terminals` → {terminals[], (express)routes, blocked?}
- `GET /api/bus?type=...&op=schedule&dep=코드&arr=코드&date=YYYYMMDD[&depName&arrName]` → {rows[], note, blocked?}
- `GET /api/subway?kind=...` (기존, 별도 문서)

### 참고 — 스크래핑 상세(향후 수리용)
- **KOBUS**: main.do로 쿠키 seed → `readRotLinInf.ajax`(rotInfList=터미널/노선) → `alcnSrch.do`(fnSatsChc 인자: date,deprTime,…,busClsCd). 서버 HTML은 첫 행만 완전 렌더(나머지 JS) → 출발시각·등급만 신뢰.
- **티머니**: `/` seed → `readTrmlList.do`(409 터미널 JSON) → `readAlcnList.do`(**bef_Aft_Dvs=D, req_Rec_Num=10 필수**). readSasFeeInf 인자: [8]time,[11]운수사,[12]등급,[16]잔여,[17]총좌석.
- **영화관**: `mcp.aka.page/api/{chain}/{op}` (daiso CLI가 감싸는 표면). CGV=timetable, 메가박스·롯데=seats.
- **혼잡도**: `openapi.seoul.go.kr:8088/{KEY}/json/citydata_ppltn/1/5/{장소}` — 응답키 `SeoulRtd.citydata_ppltn`.
- **분실물**: LOST112 `findList.do`는 POST·302(세션/토큰)라 자동조회 불가 → 안내형(공식 링크). SITE=V, DEP_PLACE, PRDT_NM, START/END_YMD.
