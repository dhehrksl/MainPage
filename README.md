# QATESTER

URL 하나만 입력하면 Gemini가 페이지 구조와 텍스트를 분석해 실제 콘텐츠에 근거한 QA 테스트 케이스를 자동 생성하고, TC 관리·버그 트래킹·QA 리포트까지 한 곳에서 다루는 개인용 QA 플랫폼입니다.

반복되는 TC 작성 업무를 줄이고 싶어서 시작했고, 만들면서 QA 업무 전반(TC 설계 → 실행 → 결함 추적 → 리포트)을 도구로 옮기는 작업으로 범위가 넓어졌습니다.

## 왜 만들었나

챗봇 QA 업무를 하면서 반복되는 비효율 두 가지를 직접 해결하고 싶었습니다.

- 새 화면/기능이 나올 때마다 TC를 처음부터 손으로 짜는 시간
- TC·버그·리포트가 엑셀 여러 파일에 흩어져서 현황을 한눈에 보기 어려운 문제

## 주요 기능

| 메뉴 | 기능 |
|---|---|
| 대시보드 | 전체 TC/버그 현황, 통과율, 최근 활동 요약 |
| 유사 발화 생성 | 엑셀 업로드 → Gemini로 유사 발화 배치 생성, 생성 이력 조회, 엑셀 다운로드 |
| TC 관리 | TC 등록·수정·삭제·상태 변경, 검색/필터, 엑셀 가져오기·내보내기, **URL → TC 자동 생성** |
| QA 리포트 | 카테고리별 통과율, 담당자별 버그 분포, 최근 14일 실행 트렌드, TC↔버그 연결 추적, 리포트 엑셀 내보내기 |
| 버그 리포트 | 버그 등록·수정·삭제, 심각도/우선순위/담당자 관리, 관련 TC 연결 |
| 게시판 | QA팀 정보 공유용 게시판 (목록/작성/상세) |

### URL → TC 자동 생성 (핵심 기능)

1. URL 입력 → Puppeteer가 헤드리스 브라우저로 페이지를 열어 헤딩·버튼·링크·입력 필드·본문 텍스트를 수집
2. (선택) 스크린샷을 함께 캡처해 시각 정보로 활용 — 기본은 비용 절감을 위해 텍스트 분석만 사용
3. 수집한 정보를 Gemini에 전달해, **실제로 페이지에 존재하는 요소에 근거한** TC를 JSON으로 생성
   - 페이지에 없는 기능은 지어내지 않도록 프롬프트에 명시
   - 각 TC의 설명은 "1. ... 2. ..." 형태의 재현 가능한 구체적 절차로 생성
   - 근거가 부족하면 요청한 개수보다 적게 생성 (억지로 채우지 않음)
4. 생성된 TC를 검토 후 선택 저장 → TC 관리 목록에 반영

## 아키텍처 특징: DB 장애 허용 설계

MongoDB 연결이 끊겨도 서비스가 멈추지 않도록 설계했습니다.

- 백엔드: MongoDB 연결 실패 시에도 서버는 정상 기동, CRUD API만 503을 반환
- 프론트엔드: API 호출 실패 시 자동으로 `localStorage` 기반 로컬 모드로 전환해 계속 사용 가능
- MongoDB가 다시 연결되면 이후 요청부터 자동으로 DB 모드로 복귀
- 화면에는 현재 "DB 연결됨" / "로컬 모드" 상태를 배지로 표시

## 기술 스택

**Frontend**: React, React Router, styled-components, xlsx (엑셀 가져오기/내보내기)
**Backend**: Node.js, Express, Mongoose(MongoDB)
**AI**: Google Gemini API (`gemini-2.5-flash-lite`) — 유사 발화 생성, URL 기반 TC 자동 생성
**자동화**: Puppeteer (페이지 구조 수집)

## 폴더 구조

```
Server.mjs            # Express 백엔드 (API, DB 스키마, Gemini 호출)
src/
  pages/
    Home.js            # 대시보드
    Services.js         # 유사 발화 생성기
    Content.js           # TC 관리 + URL→TC 생성
    Review.js            # QA 리포트
    Problem.js           # 버그 리포트
    Board.js / BoardWrite.js / BoardDetail.js  # 게시판
  api/client.js         # API 클라이언트 (DB 실패 시 localStorage 폴백 포함)
  components/Navbar.js
  styles/theme.js
```

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. .env 파일 생성 (프로젝트 루트)
MONGODB_URI=mongodb://127.0.0.1:27017/qa_platform
GOOGLE_API_KEY=발급받은_Gemini_API_키

# 3. 백엔드 실행 (5000번 포트)
node Server.mjs

# 4. 프론트엔드 실행 (별도 터미널)
npm start
```

MongoDB 없이도 프론트엔드는 로컬 모드로 동작하지만, URL→TC 생성·유사 발화 생성 기능은 `GOOGLE_API_KEY`가 필요합니다.

## 다음 목표

- TC 변경 이력(버전) 로그 — 지금은 최신 상태만 저장, 누가 언제 무엇을 바꿨는지 추적 불가
- 로그인/권한 분리 — 현재는 인증 없이 누구나 전체 기능 사용 가능
- 생성된 TC를 실제 회귀 테스트 스크립트(Playwright/Selenium)로 바로 연결하는 기능
- 스크린샷 기반 시각 분석 모드의 비용 대비 품질 검증 후 기본값 재검토
