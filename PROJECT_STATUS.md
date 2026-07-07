# PROJECT_STATUS — 서울 지하철 정보 찾기 앱

> 최종 갱신: 2026-07-07 · 위치: `C:\Users\GB\Documents\gong-medical-app`
> 배포: cslis07/Vercel · 공개 URL: https://gong-medical-app.vercel.app

---

## 1. 프로젝트 목적

공공데이터로 **서울(수도권) 지하철 정보**를 한 화면에서 조회하는 무료 웹앱.

- **데이터 출처**: 서울 열린데이터광장(data.seoul.go.kr) · 서울교통공사
- **구조**: 순수 HTML + vanilla JS 프론트엔드 + Vercel 서버리스 함수(`/api/subway`)가 외부 API 호출·키 은닉·CORS 해결
- **회원가입/로그인 없음**
- **2026-07-07 대개편**: 기존 "공공의료·지하철" 앱에서 **의료 기능(응급실·병의원·약국)을 전부 제거**하고 **지하철 전용 생활서비스 앱**으로 재편. URL·Vercel 프로젝트는 그대로(gong-medical-app) 유지.

---

## 2. 현재 구현된 기능 (지하철 단일 화면)

- **🗺️ 전체 노선도** — 공식 서울 지하철 노선도 이미지(5612×5612). 확대/축소·드래그, 상단 **역 검색창**(654개역 자동완성)
- 역 검색 → **종합 상세 모달**(호선 여러 개면 호선 버튼으로 전환):
  - 🚊 실시간 정보(도착 + 열차 위치 통합), ⏰ 첫차/막차, 🗺️ 최단경로(현재 역 출발 자동), ♿ 편의시설, 📊 승하차 통계, 🚧 출입구 폐쇄, 🌬️ 실내공기질
- **오류 시 🔄 다시 시도 버튼**
- **모바일 최적화**: 바텀 시트 모달, 16px 입력폰트(iOS 줌 방지), 44px 터치 타겟, PWA 메타
- **📖 이용가이드** (`guide.html`) — 사이드바 TOC + 스크롤스파이 + 모바일 드로어 + FAQ (지하철 전용으로 정리됨)

---

## 3. 수정한 주요 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 지하철 컨트롤 + 공용 모달만 남김. 의료 탭·헤더 연계 링크(약 정보·출산육아) 삭제, 제목/설명 지하철화 |
| `js/app.js` | 지하철 로직만 — TABS.subway, 노선도 이미지 뷰, 역 종합 모달, 지하철 렌더러, 오류 재시도. (1196→917줄) |
| `css/style.css` | 전체 스타일 + 모바일 미디어쿼리 (의료용 스타일 일부는 미사용 dead CSS로 잔존, 무해) |
| `api/subway.js` | 지하철 프록시 (kind 분기, 좌표 조인, XML 파싱) |
| `img/subway-map.png` | 공식 노선도 이미지 (5612×5612, 4.22MB) |
| `guide.html` | 이용가이드 — 지하철 전용으로 재작성 |
| `dev-server.mjs` | 로컬 검증 서버 — `/api/subway`만 라우팅 (proxy 라우트 제거) |
| `vercel.json` | 보안 헤더 |
| `.env` / `.env.example` | API 키 (gitignore) |

### 🗑️ 2026-07-07 삭제됨 (의료 기능)
- `api/proxy.js`(data.go.kr 의료 프록시), `js/regions.js`(17시도 시군구 매핑) 파일 삭제
- `js/app.js`의 `TABS.medical`·`renderEmergency`·`renderFacility`·`renderNearby`·`renderTrauma`·`renderSevere`·`pediatricBlock`·`searchRegion`·`searchGeo`·`runQuery`·`SEVERE_TYPES`·`initSevere`·`initRegions` 등 의료 코드 제거
- `index.html`: 의료 탭·지역/GPS/중증질환/병상 컨트롤·약정보/출산육아 헤더 링크 제거
- `guide.html`: 의료 섹션·의료 FAQ·의료 데이터출처 제거
- (이전 2026-07-02에 `api/seoul.js` 서울예약도 삭제됨 → 쑥쑥 포털로 이관)

---

## 4. 남은 작업

- [ ] (선택) 노선도 이미지 위 역별 클릭 핫스팟 (현재는 검색으로 접근 — 이미지라 좌표 없음)
- [ ] (선택) OG 이미지 1200×630 (카톡 공유 미리보기)
- [ ] (선택) 미사용 dead CSS(의료 카드 스타일) 정리
- [ ] (확인) 실시간 도착(`arrival`) 로컬 빈 응답 — `SEOUL_REALTIME_KEY` 점검 (운영 Vercel에는 등록됨)

### ✅ 최근 완료
- **지하철 전용 개편(2026-07-07)**: 의료 기능 전면 삭제, 이용가이드·메인·JS 지하철화 · 로컬 검증(200/404/mapData OK)

---

## 5. 실행 명령어

```bash
# 로컬 개발 서버 (포트 3005)
cd C:\Users\GB\Documents\gong-medical-app
node dev-server.mjs          # → http://localhost:3005

# 배포 (cslis07 계정)
vercel --prod --yes          # gong-medical-app (CLI 직접 배포)
```

### 환경변수 (.env / Vercel 모두 필요 — 지하철만)
```
SEOUL_API_KEY=...       # 서울 열린데이터광장 — 지하철 정보/통계/시설 (계정 단위 키)
SEOUL_REALTIME_KEY=...  # 지하철 실시간 도착/위치 (별도 키, swopenapi.seoul.go.kr)
```
> ⚠️ `DATA_API_KEY`(공공데이터포털 의료용)는 이제 코드 미사용 — 남아 있어도 무해.
> ⚠️ `SUBWAY_*` 10개 키도 미사용(계정 키 하나로 전 데이터셋 호출).

### ⚠️ 검증 규칙
- `dev-server.mjs`·`api/*.js`는 ES 모듈 1회 로드 → **수정 후 서버 재시작**(포트 kill 후)
- 정적 파일(app.js/css/html)은 **브라우저 새로고침**만

---

## 6. 배포 관련 주의사항

1. **cslis07 계정 전용** — GitHub·Vercel 모두 cslis07. push 전 `gh auth status --active` 확인
2. **환경변수 2개**(SEOUL_API_KEY, SEOUL_REALTIME_KEY) 운영 Vercel에 등록(없으면 프록시 500)
3. **Deployment Protection** — 켜져 있으면 외부 접속 401. 현재 공개(200) 확인됨
4. **키 보안** — 절대 소스 커밋 금지. `.env`(gitignore)·Vercel 환경변수로만
5. **이미지 배포** — `img/subway-map.png`는 gitignore 대상 아님(커밋·배포됨). `node_modules`는 gitignore
6. **서울 API 키 형식** — hex 문자열 그대로 URL 사용(ASCII 디코딩 금지)

---

## 7. API 구조

### `/api/subway` — 지하철 (`?kind=<종류>`)
**실시간** (swopenapi.seoul.go.kr, `SEOUL_REALTIME_KEY`):
- `arrival` — `realtimeStationArrival/{역명 or ALL}`
- `position` — `realtimePosition/{호선}` (1~9호선만 제공)

**정보·통계** (openapi.seoul.go.kr:8088, `SEOUL_API_KEY` 계정 키):
| kind | 서비스명 | 비고 |
|---|---|---|
| `mapData` | subwayStationMaster + SearchSTNBySubwayLineInfo | 좌표+순서 조인(역명→대표호선) |
| `firstlast` | SearchFirstAndLastTrainbyLineServiceNew | {호선}/{상하행}/{요일} |
| `accessibility` | OdblrDspsnCvntl | 역별 시설 대수 |
| `elevatorLift` | tbTraficElvtr + tbTraficEntrcLft | 통합, FAC_TYPE 태그 |
| `stats` | CardSubwayStatsNew | 일별. YYYYMM→그 달 병렬 합산 |
| `timeStats` | CardSubwayTime | 월별만(USE_MM) |
| `airquality` | airPolutionInfo | XML 전용, 서버 정규식 파싱 |
| `closure` | TbSubwayLineDetail | 출입구 임시폐쇄 |
| `shortestPath` | getShtrmPath | {출발}/{도착}/{일시} |

**표준 호출**: `{BASE}/{KEY}/json/{서비스}/{시작}/{끝}/{...파라미터}/`
**subwayId 코드**: 1001~1009=1~9호선, 1063 경의중앙, 1065 공항, 1067 경춘, 1075 수인분당, 1077 신분당, 1081 경강, 1092 우이신설, 1093 서해, 1094 신림, 1032 GTX-A

---

## 참고: 노선도 이미지 재생성 (PDF → PNG)

```bash
cd C:\Users\GB\Documents\gong-medical-app
npm install pdf-to-img --no-save   # 임시(package.json 미포함)
# pdf-to-img로 map_korea.pdf page1을 scale 2.2로 렌더 → img/subway-map.png (5612×5612)
```
원본: `map_korea.pdf` (서울교통공사 공식 노선도)
