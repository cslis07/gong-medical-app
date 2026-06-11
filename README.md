# 🏥 공공의료 정보 찾기

국립중앙의료원 공공데이터(공공데이터포털 data.go.kr)를 활용한 **응급실 실시간 가용병상 · 병·의원 · 약국 찾기** 웹앱입니다.
순수 HTML + JavaScript 프론트엔드와 Vercel 서버리스 함수(API 프록시)로 구성됩니다.

## 기능
- 🚑 **응급실**: 시/도·시/군/구별 응급실 실시간 가용병상(일반·수술실·입원실), 구급차·CT·MRI 가용 여부, 응급실 전화
- 🏥 **병·의원**: 시/도·시/군/구·기관명으로 병의원 검색, 오늘 진료시간, 전화, 카카오맵 길찾기
- 💊 **약국**: 시/도·시/군/구·기관명으로 약국 검색, 오늘 운영시간, 전화, 지도

## 구조
```
index.html          # UI
css/style.css       # 스타일
js/regions.js       # 17개 시도 → 시군구
js/app.js           # 탭/조회/렌더링
api/proxy.js        # Vercel 서버리스 — data.go.kr 호출 + XML→JSON 변환 (키 서버 보관)
```

## 사용 공공데이터 (제공: 국립중앙의료원, B552657)
| 서비스 | 오퍼레이션 |
|---|---|
| 전국 응급의료정보조회 `ErmctInfoInqireService` | `getEmrrmRltmUsefulSckbdInfoInqire` (실시간 가용병상) |
| 전국 병·의원 찾기 `HsptlAsembySearchService` | `getHsptlMdcncListInfoInqire` |
| 전국 약국 정보 조회 `ErmctInsttInfoInqireService` | `getParmacyListInfoInqire` |

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
