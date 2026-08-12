# TourPlanit Netlify 릴리스 후보

> 2026-08-12 production 배포와 실제 왕복 검증 결과를 기록한다. 환경변수 값, 인증키, 개인정보는 기록하지 않는다.

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
| Production branch | `codex/tourplanit-ui-redesign` |
| Production deploy | `6a7c0a32181b460008274ad4` (`5b83d4d`) |
| Public URL | `https://tourplanit.netlify.app` |

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
- [x] Netlify production branch 확인
- [x] 필수 서버 환경변수 `KTO_API_KEY`, `ANTHROPIC_API_KEY` 존재 확인
- [x] 승인된 커밋 push
- [x] production 배포

구형 `VITE_CLAUDE_API_KEY`, `VITE_JSONBIN_API_KEY`, `VITE_KTO_API_KEY`는 Dashboard 삭제 확인까지 진행했으나 Netlify가 변경을 저장하지 않아 후속 보안 정리가 필요하다. 현재 릴리스 소스는 이 변수를 참조하지 않으며 Vite 번들에는 `BASE_URL` 외 `import.meta.env` 참조가 없다.

최초 `6abc132` 배포는 `netlify/functions/*.test.cjs`가 함수로 인식되어 실패했다. 테스트를 `tests/netlify`로 이동한 `5b83d4d`에서 배포가 성공했다. 이전 정상 배포는 실패 과정에서 유지됐다.

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

### 2026-08-12 실제 성공 증빙

- 제주·1박 2일·자연/힐링·가족·1인 30만원대·노쇼핑 조건으로 로그인 없이 생성 완료
- KTO KorService2 `areaBasedList2`, 지역 코드 `39`, 관광지 20건, 조회 시각과 활용 필드가 결과 화면에 표시됨
- AI 상품명·컨셉·2일 일정 생성 완료
- 일정, 10인 기준 견적, 4:5 카드뉴스 6장, 블로그 본문 1,314자, 인스타그램·카카오 문구 확인
- `<UNKNOWN>`, `null`, `undefined`가 고객용 홍보 문구에 표시되지 않음
- 캡처 폴더: `submission-assets/2026-08-12-netlify-production/`
- production 데스크톱 왕복 검증 완료. Chrome DevTools Responsive `390×844`에서 홈·주요 CTA·카드 레이아웃과 가로 넘침 부재를 재확인했다.
- DevTools의 콘솔 메시지 1건은 설치된 Chrome 확장 프로그램의 비동기 메시지 채널 종료 오류로 확인되며 TourPlanit 소스 오류가 아니다.

## 6. 중단 조건

- production URL이 로그인·권한·보호 페이지로 막힘
- KTO 함수가 200이 아니거나 관광지가 0건
- AI 함수가 인증 오류·timeout으로 핵심 흐름을 완료하지 못함
- KTO fallback을 실시간 데이터로 표시함
- 공식 기능설명서의 endpoint·화면 명칭이 production과 다름
- 키·개인정보가 번들, URL, 화면, 로그에 노출됨

중단 조건이 발생하면 제출 캡처와 공모전 업로드를 진행하지 않고 원인과 필요한 조치만 보고한다.
