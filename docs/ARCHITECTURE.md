# 코드·데이터 구조

기준일: 2026-11-03. 현재 제품 상태는 [PROJECT_STATUS.md](PROJECT_STATUS.md), 초기 설계 자료는 원본 PRD/SQL과 개별 단계 검증 문서에 보존합니다.

## 폴더

```text
app/                         Expo Router 라우트와 화면 조립
  _layout.tsx                공통 Provider·테마·탐색 셸
  login.tsx / signup.tsx      로그인·서버 정책을 따르는 가입 요청
  auth/                      이메일 callback·비밀번호 갱신·CAPTCHA 페이지
  (main)/                    로그인한 회원의 옷장·코디·설정·기록 등
src/
  components/ui/             버튼·폼·아이콘·선택·상태 UI
  components/layout/         PC/모바일 탐색·반응형 셸
  providers/                 세션·개인 캐시 경계·미저장 이동 확인
  features/
    auth/                    이메일/PKCE·CAPTCHA 플랫폼 어댑터
    wardrobe/                의류 폼·목록·상세·상태·휴지통
      photos/                선택/변환·예약/전송·비공개 사진 표시
    brands/ / categories/    개인 브랜드·로고·분류·정렬·삭제
    outfits/                 코디 초안·겹쳐 입기·선택·저장·카탈로그
    recommendations/         추천 규칙·색상 평가·교체·플랫레이 렌더
    color-combinations/      상/하의 배색·찜·비교·이미지 저장
    style-guide/ / weather/  스타일 정보·헤더 날씨
    wear/ / insights/        착용 스냅샷·달력·기간별 통계
    settings/                테마·정렬·밀도·프로필 설정
    backup/                  데이터/이미지 백업·검증·복원
    usage/                   본인 사용량·업로드 용량 확인
  lib/                       공개 설정·Supabase 연결·Query 키/캐시
  theme/                     화이트·베이지·다크 토큰
  types/database.generated.ts 로컬 검증 DB에서 생성한 공개 API 타입
supabase/
  migrations/                실제 적용 스키마·함수·정책의 순차 이력
  config.toml                로컬 개발 설정
  functions/                 서버 기능 확장 위치
scripts/                     환경 준비·검사·빌드·로컬 백업
  check-public-registration.mjs 읽기 전용 운영 가입 준비 검사
deployment/                  운영 대상과 범위를 제한한 Auth 설정
.openai/hosting.json          기존 Sites 프로젝트 ID·SPA 배포 선언
```

## 의존 방향

라우트 → 기능 화면/Query → service 또는 repository → Supabase API/RPC → DB·Storage 순서입니다. 입력 검증·추천 평가·초안 변경은 순수 모듈로 분리합니다. UI는 공통 테마와 컴포넌트를 공유하며 사진 선택·캡처·파일 저장·CAPTCHA는 플랫폼 어댑터를 사용합니다.

TypeScript의 공개 DB 타입은 `npm run db:types`로 생성합니다. SQL 변경은 로컬 검증·migration 기록·운영 적용 후 타입과 앱을 함께 반영합니다. 과거 migration을 수정하거나 운영 DB를 reset하지 않습니다.

## 데이터와 보안 경계

- `profiles`, `wardrobe_items`, `brands`, 회원 분류 설정, `outfits`/`outfit_items`, `wear_events`/`wear_event_items`가 핵심 데이터입니다.
- 코디의 의류는 실제 ID와 `(slot, position)`으로 저장합니다. 아우터/상의는 position 0..2, 나머지는 0입니다. 기존 단일 슬롯 초안과 호환합니다.
- 착용 스냅샷은 이후 의류·코디 편집과 분리하여 당시 기록을 유지합니다.
- `wardrobe-private`, `brand-private`, `outfit-renders-private`는 비공개 버킷입니다. 사진은 제한된 signed URL로 읽고 사용자별 경로를 검사합니다.
- 개인 읽기/쓰기는 RLS·복합 FK·RPC의 소유권/버전/상태 검사로 제한합니다. 계정 전환 시 개인 Query와 초안을 분리합니다.
- 중요한 쓰기는 단일 RPC 트랜잭션과 재시도 ID/버전 검사로 다룹니다. 파일 전송은 재개 가능하지만 DB 변경과 하나의 원자적 작업으로 주장하지 않습니다.
- `app_private.member_limits`는 관리자용 한도 설정입니다. 회원은 값을 수정할 수 없고 자신의 집계만 invoker RPC로 조회합니다. 의류는 trigger, 이미지 쓰기는 restrictive Storage RLS가 최종 제한합니다.

## 추천과 이미지

추천은 실제 보유 중인 의류만 사용하며 색상·계절·스타일·다양성과 고정 아이템을 평가합니다. 현재 자동 추천은 슬롯당 한 벌이며 저장 후 수동으로 레이어를 추가할 수 있습니다. 원본 사진으로 플랫레이를 만들고 웹 SVG/canvas와 네이티브 캡처가 같은 구성·좌표를 사용합니다. 마네킹·유료 AI 호출은 없습니다.

## 웹과 네이티브 인증

웹 CAPTCHA는 Cloudflare 스크립트를 명시적으로 불러오고 토큰은 현재 요청의 메모리에만 보관합니다. 네이티브는 지정한 HTTPS 사이트의 `/auth/challenge`를 WebView로 열고 해당 origin·경로의 메시지만 받습니다. 실제 키 연결과 네이티브 실기기 검증은 공개 테스트 준비 단계에 남아 있습니다.
