# 🏥 공공의료 정보 찾기

국립중앙의료원 공공데이터(공공데이터포털 data.go.kr)를 활용한 **응급실 실시간 가용병상 · 병·의원 · 약국 찾기** 웹앱입니다.
순수 HTML + JavaScript 프론트엔드와 Vercel 서버리스 함수(API 프록시)로 구성됩니다.

## 기능
- 🚑 **응급실**: 실시간 가용병상(일반·수술실·입원실)·구급차·CT·MRI / 📍내 주변(위치기반) / 🚨외상센터
- 🏥 **병·의원**: 시/도·시/군/구·기관명 검색, 오늘 진료시간 / 🌙달빛어린이병원(야간 소아진료)
- 💊 **약국**: 시/도·시/군/구·기관명 검색, 오늘 운영시간 / 📍내 주변(위치기반)
- 🎫 **서울 예약**: 서울시 공공서비스예약(문화행사·교육·진료·체육시설·시설대관·종합), 자치구·접수상태·키워드 필터, 예약 바로가기
- 🚇 **지하철**: 실시간 도착 · 실시간 열차 위치 · 역 정보(호선/코드) · 편의시설(엘리베이터/에스컬레이터)

## 구조
```
index.html          # UI
css/style.css       # 스타일
js/regions.js       # 17개 시도 → 시군구
js/app.js           # 탭/모드/조회/렌더링
api/proxy.js        # Vercel 서버리스 — data.go.kr 호출 + XML→JSON 변환 (DATA_API_KEY)
api/seoul.js        # Vercel 서버리스 — 서울 OpenAPI(JSON) 프록시 (SEOUL_API_KEY)
```

## 사용 공공데이터
**국립중앙의료원 (data.go.kr, B552657)** — `DATA_API_KEY`
| 서비스 | 오퍼레이션 |
|---|---|
| 응급의료 `ErmctInfoInqireService` | `getEmrrmRltmUsefulSckbdInfoInqire`(실시간 병상), `getEgytLcinfoInqire`(위치), `getStrmListInfoInqire`(외상센터) |
| 병·의원 `HsptlAsembySearchService` | `getHsptlMdcncListInfoInqire`, `getBabyListInfoInqire`(달빛어린이병원) |
| 약국 `ErmctInsttInfoInqireService` | `getParmacyListInfoInqire`, `getParmacyLcinfoInqire`(위치) |

**서울 열린데이터광장 (openapi.seoul.go.kr)** — `SEOUL_API_KEY` (계정당 1키)
| 카테고리 | SERVICE |
|---|---|
| 공공서비스예약 종합/문화행사/교육/진료/체육시설/시설대관 | `tvYeyakCOllect` / `ListPublicReservationCulture` / `...Education` / `...Medical` / `...Sport` / `...Institution` |
| 지하철 역정보/편의시설 | `SearchInfoBySubwayNameService` / `SeoulMetroFaciInfo` |

**서울 지하철 실시간 (swopenapi.seoul.go.kr)** — `SEOUL_REALTIME_KEY` (실시간 전용 권한 키)
| 기능 | SERVICE |
|---|---|
| 실시간 도착 / 실시간 위치 | `realtimeStationArrival` / `realtimePosition` |
> ⚠️ 실시간 서비스는 일반 `SEOUL_API_KEY`로는 `ERROR-338`(권한없음). 실시간 데이터셋용 별도 키 필요.

## 로컬 실행
```bash
npm install
cp .env.example .env     # .env 에 DATA_API_KEY 값 입력 (gitignore 됨)
node dev-server.mjs      # http://localhost:3005  (정적파일 + /api/proxy 모사)
# 또는 Vercel CLI:  npm run dev   (vercel dev)
```
> 인증키(`DATA_API_KEY`)가 없으면 `/api/proxy` 가 500 을 반환합니다. 소스에는 키를 넣지 않습니다.

## 배포 (GitHub + Vercel)
1. 이 저장소를 GitHub에 push
2. [vercel.com](https://vercel.com) → New Project → 저장소 Import
3. (권장) Settings → Environment Variables 에 `DATA_API_KEY` 등록
4. Deploy

## 주의
- 인증키는 `DATA_API_KEY` 환경변수로만 주입합니다. 소스코드/저장소에 키를 커밋하지 마세요.
- Vercel 배포 시 반드시 프로젝트 환경변수에 `DATA_API_KEY` 를 등록해야 합니다.
- 실시간 가용병상은 의료기관 입력 시점 기준이며 실제와 다를 수 있습니다. **응급상황 시 119.**
- 데이터 출처 표기: 국립중앙의료원 / 공공데이터포털(data.go.kr)
