# TourPlanit Netlify 릴리스 후보

> 이 문서는 production 배포 직전 검토용이다. 환경변수 값, 인증키, 개인정보는 기록하지 않는다.

## 1. 확정 기준

- 소스: `/Users/kingsman/Developer/tourplanit-redesign`
- 브랜치: `codex/tourplanit-ui-redesign`
- 제출 호스팅: Netlify
- 공개 서비스: 로그인 없이 핵심 기능 사용
- Vercel·GitHub Pages: 공모전 제출 후보에서 제외

## 2. Netlify 계약

| 항목 | 값 |
| --- | --- |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |
| Node | 20 |
| SPA fallback | `/*` → `/index.html` (200) |
| Production branch | Netlify Dashboard에서 `codex/tourplanit-ui-redesign` 확인 필요 |

필수 서버 환경변수는 `KTO_API_KEY`, `ANTHROPIC_API_KEY`다. `ANTHROPIC_MODEL`은 선택 사항이며 미설정 시 코드 기본값을 사용한다. 비밀값에 `VITE_` 접두사를 사용하지 않는다.

## 3. 배포 전 승인 게이트

- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] 서버 함수 Node 문법 검사
- [x] 데스크톱 1280×720 QA
- [x] 모바일 390×844 QA
- [x] KTO 키 누락 시 기본 데이터·재확인 상태 및 KTO 출처 미표시
- [x] 카드뉴스 데스크톱·모바일 4:5
- [ ] Netlify production branch 확인
- [ ] Netlify 환경변수 이름·Functions 적용 범위 확인
- [ ] 승인된 커밋 push
- [ ] production 배포

## 4. 배포 후 왕복 검증

아래의 `<NETLIFY_URL>`은 확정된 production URL로 바꾼다. 응답 본문 전체와 비밀값은 터미널·보고서에 복사하지 않는다.

```bash
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' '<NETLIFY_URL>/'
curl -sS -o /tmp/tourplanit-kto-check.json -w '%{http_code} %{content_type}\n' '<NETLIFY_URL>/.netlify/functions/kto-proxy?areaCode=39&contentTypeId=12&numOfRows=1'
node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync("/tmp/tourplanit-kto-check.json","utf8"));console.log({spotCount:Array.isArray(d.spots)?d.spots.length:0,hasSource:Boolean(d.source),api:d.source?.api||null})'
```

기대 결과:

- 홈페이지 HTTP 200과 HTML 응답
- KTO 함수 HTTP 200
- `spotCount >= 1`
- `hasSource: true`
- API명이 `관광정보 OpenAPI KorService2 / areaBasedList2`
- 응답에 `serviceKey` 또는 실제 키 값이 없음

브라우저 왕복 검증:

1. 시크릿/새 브라우저에서 production URL을 로그인 없이 연다.
2. 제주·2박 3일·자연/힐링·가족 조건을 선택한다.
3. 로딩 문구가 관광공사 수집 → AI 생성 순서로 표시되는지 확인한다.
4. 결과의 관광 데이터 근거에서 `실시간 연동`, API명, 지역 코드, 조회 시각, 활용 필드, 관광지 목록을 확인한다.
5. 일정·견적·카드뉴스·블로그·채널 문구 탭을 왕복한다.
6. 카드뉴스가 4:5이고 모바일 가로 스크롤이 없는지 확인한다.
7. 공유 링크를 새 브라우저에서 열고 기존 데이터 호환성을 확인한다.
8. 키 누락/무효를 별도 preview에서 재현할 경우 `기본 데이터`, `재확인 필요`, KTO 출처 미표시를 확인한다.
9. 브라우저 개발자 도구의 자산·응답에 비밀값이 없는지 확인한다.

## 5. 제출 증거 촬영

- 대표 이미지: 조건 입력과 생성 결과의 서비스 정체성이 함께 보이는 실제 화면
- 상세 1: 지역·기간·테마·타깃·예산 입력 — “상품 조건을 한 번만 구조화해 입력”
- 상세 2: 관광 데이터 근거 — “성공한 KorService2 데이터의 API명·필드·관광지 후보 확인”
- 상세 3: 일정표 — “동일 기획 결과를 일자별 운영 초안으로 전환”
- 상세 4: 참고 견적 — “인원과 운영 기준에 따른 검토용 비용 구조”
- 상세 5: 4:5 카드뉴스·블로그·카카오 — “한 기획안을 다채널 홍보 초안으로 연결”

실제 성공 응답이 보이는 상세 2 캡처를 확보하기 전에는 OpenAPI 활용 증빙을 완료로 표시하지 않는다.

## 6. 중단 조건

- production URL이 로그인·권한·보호 페이지로 막힘
- KTO 함수가 200이 아니거나 관광지가 0건
- AI 함수가 인증 오류·timeout으로 핵심 흐름을 완료하지 못함
- KTO fallback을 실시간 데이터로 표시함
- 공식 기능설명서의 endpoint·화면 명칭이 production과 다름
- 키·개인정보가 번들, URL, 화면, 로그에 노출됨

중단 조건이 발생하면 제출 캡처와 공모전 업로드를 진행하지 않고 원인과 필요한 조치만 보고한다.
