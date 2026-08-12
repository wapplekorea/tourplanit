# TourPlanit 한국관광공사 OpenAPI 활용정보 입력 문안

> 인증키 값은 이 문서에 기록하지 않는다. 콘텐츠랩의 지정 입력란에 신청자 본인이 입력한다.

## 서비스 URL

`https://tourplanit.netlify.app`

## 활용 API

- API명: 한국관광공사 관광정보 OpenAPI KorService2
- 기능명: 지역기반 관광정보 조회
- endpoint: `/B551011/KorService2/areaBasedList2`
- 서비스 내 서버 경로: `/.netlify/functions/kto-proxy`
- 주요 요청 파라미터: `areaCode`, `contentTypeId`, `numOfRows`, `pageNo`, `MobileOS`, `MobileApp`, `_type`
- 실제 활용 응답 필드: `title`, `addr1`, `firstimage`, `firstimage2`, `contentid`, `contenttypeid`

## 서비스 내 활용 위치

사용자가 지역·기간·테마·타깃·예산을 입력하면 서버 함수가 KorService2의 지역기반 관광정보를 조회한다. 성공한 관광지 데이터는 AI 여행상품 생성의 지역 관광지 후보로 전달되고, 결과 화면의 `관광 데이터 근거` 패널에 API명, 지역 코드, 조회 시각, 활용 필드와 관광지 목록으로 표시된다. 일정·견적·카드뉴스·블로그·카카오 홍보 문구는 동일 상품 초안을 기준으로 생성된다.

## 성공 판정과 fallback 구분

HTTP 성공, KTO 응답 코드 `0000` 또는 결과 코드 미기재, 관광지 1건 이상을 모두 만족할 때만 KTO 실데이터 성공으로 판정한다. 키 누락·무효, 네트워크 오류, 빈 결과에서는 KTO 출처를 표시하지 않고 오류 또는 기본 데이터 상태를 명시한다. fallback 데이터는 실제 KTO 호출 성공으로 표시하지 않는다.

## 검증 예시(키 제외)

- 지역: 제주
- `areaCode`: `39`
- `contentTypeId`: `12`
- 확인 결과: 관광지 20건과 활용 필드가 결과 화면에 표시됨
- 확인 URL: `https://tourplanit.netlify.app/.netlify/functions/kto-proxy?areaCode=39&contentTypeId=12&numOfRows=1`

## 기타 API

- Anthropic Messages API: Netlify Function을 통한 여행상품 JSON 초안 생성. 브라우저에 API 키를 노출하지 않으며 응답 구조 검증과 안전한 문구 fallback을 적용한다.
- Local Storage / URL-safe 공유 데이터: 작성 중 조건과 결과 복원·공유. 개인정보·인증키 저장 용도로 사용하지 않는다.
