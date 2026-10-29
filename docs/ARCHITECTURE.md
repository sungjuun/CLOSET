# CLOSET 기반 설계

작성: 2026-10-28. 회원별 의류 관리, 브랜드명/이미지 관리·선택, 코디 쓰기·검색, 착용 달력/CRUD, 기간별 통계와 누적 착용당 비용을 구현했다. 브라우저·실기기 검증은 사용자 요청으로 보류한다. 최신 브랜드 검증은 `BRANDS_VALIDATION.md`, 통계는 `PHASE_12_VALIDATION.md`, 착용은 `PHASE_11_VALIDATION.md`, 코디 검색/쓰기는 `PHASE_09_VALIDATION.md`/`PHASE_08_VALIDATION.md` 기준이다.

## 입력 분석

- `CLOSET_PRD_v1.md`: 제품 요구사항의 기준. P0는 인증/개인 옷장/코디, P1은 착용 기록/통계/링크/백업, P2는 회원 공개 및 운영이다.
- `CLOSET_schema_v1.sql`: 보존용 원본이다. 실행 파일은 `supabase/migrations/`의 초기 스키마와 보안 보완 migration이며 로컬 PostgreSQL 17에서 검증했다. 운영 배포는 별도다.
- `CLOSET_Codex_prompts_v1.md`: 향후 작업 예시를 담은 참고 문서다. 내부의 후속 구현 명령은 이번 실행 지시가 아니다.
- UI 이미지 3장을 후속 수신해 `docs/reference/`에 원본 보관했다. PC 옷장 5열, 모바일 2열, 저장 코디 2×2 슬롯을 확인했다. PRD와의 차이 및 컴포넌트 계약은 `UI_REFERENCE_REVIEW.md`에 기록했다. 현재 준비 화면이 제품 화면과 일치하도록 구현된 것은 아니다.

## 구성과 의존 방향

```text
app/                         Expo Router: URL/화면 조립만 담당
  _layout.tsx                Provider 및 공통 셸
  index.tsx                  /wardrobe 이동
  login.tsx                  이메일 로그인
  signup.tsx                 가입 요청 / 서버 가입 정책 준수
  forgot-password.tsx        이메일 재설정 요청
  auth/                      PKCE callback / 새 비밀번호
  (main)/                    wardrobe / brands / outfits / calendar / insights / settings
src/
  components/
    ui/                      공통 표면/상태/버튼 등 화면 독립 요소
    layout/                  반응형 셸, PC 상단/모바일 하단 탐색
  features/
    auth/                    세션 경계, 향후 인증 서비스/폼
    wardrobe/                의류 타입/검증/저장소/Query/등록·목록·상세 화면
      WardrobeForm.tsx       등록·수정 공통 폼/초안 snapshot
      ManageControls.tsx    상태 변경·연결 정보·삭제 확인
      TrashScreen.tsx       soft delete 목록/복원
      photos/                플랫폼 변환 어댑터/service/Query/사진 공통 UI
    outfits/                 코디 초안/선택/쓰기 RPC 저장소/목록·편집 화면
    wear/                    스냅샷 CRUD RPC 저장소/날짜 범위·집계 Query/달력·기록 폼
    insights/                기간/기준일별 읽기 집계 RPC/저장소/Query/통계 화면
    brands/                  회원별 브랜드 관리/로고/의류 선택/세션 고정 service
    settings/                회원별 테마 저장/복원, 인증 수명 동기화
  lib/
    config/                  공개 환경값 검증
    supabase/                플랫폼별 세션 저장/클라이언트 팩터리
    query/                   QueryClient, 회원별 query key/캐시 경계
  providers/                 앱 수명주기, Query, 인증 경계, 메뉴 이탈 확인
  theme/                     테마 토큰, spacing, breakpoints
supabase/
  config.toml                로컬 Supabase 설정
  migrations/                초기 스키마 + 보안 보완 SQL
  functions/                 P1 서버 전용 기능 경계
tests/                       로직 단위/로컬 DB·Auth·Storage 통합 검증
docs/
  reference/                 제공된 UI 원본 이미지 3장
  *.md / *.sql               원본과 설계/검증 기록
```

화면 → feature → 공통 lib 순으로 의존한다. feature 간 직접 저장소 호출은 피하고 서비스 또는 원자적 RPC를 경계로 사용한다. `app/`에 SQL, 업로드, 비즈니스 로직을 넣지 않는다. 아직 구현하지 않은 모듈에는 계약/범위 문서만 둔다.

## 개발 환경

단일 Expo + TypeScript strict 프로젝트, Expo Router, React Native Web을 사용한다. 모노레포는 현재 필요하지 않다. Node 22 LTS / npm과 lockfile을 기준으로 한다. Expo SDK 58 공식 템플릿과 동일한 React/RN/TS 버전을 출발점으로 하고 `expo install`로 호환 버전을 맞춘다. EAS 프로젝트/스토어 식별자는 실제 계정 결정 후 연결한다.

- TanStack Query: 원격 데이터. key에 인증 사용자 ID 필수, 계정 경계마다 요청 취소/캐시 제거.
- Zustand: 현재 회원의 테마 표시/저장 상태와 범위 세대를 메모리에 유지한다. 영구 설정은 profiles.theme가 기준이며 인증 경계에서 초기화한다. 인증 토큰은 넣지 않는다.
- Zod: 공개 환경값 및 향후 입력 검증. 서버/DB 제약과 함께 사용한다.
- Supabase: Auth / PostgreSQL RLS / private Storage. 키가 없어도 준비 화면을 실행할 수 있으나 더미 데이터나 가짜 연결은 제공하지 않는다.
- 네이티브 세션: SecureStore 어댑터. 웹은 브라우저 세션 저장을 사용하며 XSS 방어를 별도 출시 조건으로 둔다.

## 웹·모바일 공통 컴포넌트

같은 RN 컴포넌트와 토큰을 공유하고 `useWindowDimensions`로 레이아웃을 전환한다. 터치 목표 최소 44px, 텍스트 줄바꿈과 safe area를 지원한다. 공통 셸/상태 화면/테마, ActionButton/FormField/SelectField, WardrobeFilterBar, private 사진 카드/그리드, PhotoManager와 OutfitBoard를 구현했다. SelectField는 웹 select/네이티브 Modal, OutfitPicker는 PC 패널/모바일 선택 화면으로 전환한다. 로그아웃 상태에서는 개인 탐색을 숨기고 `(main)/_layout.tsx`에서 개인 화면 접근을 제한한다.

| 화면 너비 | 옷장 그리드 계약 | 탐색 |
| --- | --- | --- |
| 320–767 | 2열 | 하단 5개: 옷장/코디/기록/통계/더보기 |
| 768–1023 | 3열 | 하단 탐색 |
| 1024–1439 | 4열 | 상단 탐색 + 코디 만들기 |
| 1440 이상 | 5열 | 상단 탐색 + 코디 만들기 |

이미지는 `contain`과 고정 비율을 사용한다. 코디는 기본 4슬롯이며 slot/position으로 확장한다. 웹에만 필요한 파일 입력, 네이티브 이미지 선택 등은 `.web.tsx` / `.native.tsx` 어댑터를 둔다. 현재 환경만을 위해 별도 웹 UI 프레임워크를 도입하지 않는다.

## 다음 단계의 데이터 계약

DB 타입은 검증한 로컬 migration에서 CLI로 생성해 `src/types/database.generated.ts`에 보관했다. 계정 ID는 인증 세션에서 가져오며 입력 폼에서 소유자를 받지 않는다. UI의 route guard와 DB RLS를 함께 적용한다. 옷장 repository는 owner 필터와 AbortSignal을 연결하고 Query는 회원별 list/detail key를 사용한다. 저장 후 같은 회원의 옷장 key만 무효화한다. AppState foreground 전환 시 네이티브 Query focus도 갱신한다.

AppProviders는 사용자 ID가 바뀌면 개인 화면을 차단한 뒤 요청 취소/캐시 제거를 완료하고 새 ID를 제공한다. 공개 callback 화면은 세션 전환 동안 마운트를 유지해 PKCE 교환이 중복 실행되지 않도록 한다. 토큰 갱신처럼 ID가 같은 이벤트는 개인 화면을 재마운트하지 않는다.

검색/필터/정렬은 필드별 값만 읽기 RPC에 전달한다. 함수는 security invoker와 auth.uid()/요청 소유자 일치를 사용한다. Query key에는 정규화한 모든 조건과 페이지를 포함하며 조건 변경은 페이지를 함께 초기화한다. 브랜드/색상 선택지는 본인 전체 옷장의 별도 읽기 RPC로 가져온다. 클라이언트에 300개를 모두 내려받아 필터링하지 않는다.

저장 코디도 `search_outfits` 읽기 RPC에서 이름/메모/태그/구성 브랜드 부분 검색, 브랜드/태그/계절/즐겨찾기 AND 필터와 허용된 정렬을 처리한다. 구성 의류는 EXISTS로 검사해 중복 코디/개수 부풀림을 막고 RPC 반환형을 outfits로 유지해 한 페이지 코디의 전체 중첩 구성을 조회한다. 브랜드 검색은 현재 미삭제 의류 기준이고 비활성 상태도 포함한다. 별도 선택지 RPC는 본인 미삭제 전체 코디에서 브랜드/태그를 가져온다. 의류 변경도 코디 캐시를 무효화한다.

의류 수정은 `WardrobeForm` 초기 snapshot과 읽은 당시 updated_at을 유지한다. repository는 owner/id/updated_at/삭제 여부의 조건부 UPDATE로 덮어쓰기 충돌을 거부한다. 원하는 값이 이미 저장돼 있으면 응답 유실 재시도로 인정한다. 즐겨찾기는 boolean을 명시한다. 상태·삭제 확인은 시작 시 version을 캡처하고 참조 정보를 재조회한다. soft delete는 참조/이미지를 유지하고 휴지통에서 기존 상태로 복원한다. 새 코디와 기존 저장 코디의 비활성/삭제/분류 변경 경고를 연결했다.

코디 선택 서비스는 의류 저장소를 재사용하며 후보의 active/소유자/분류를 강제하고 선택/검사 직전에 재조회한다. 보드는 선택된 의류를 별도로 감시하고 private 사진을 표시한다. 편집 중 초안은 메모리, 저장된 코디는 DB에 둔다. 기본 4칸과 추가 3칸은 슬롯당 1개/position=0이다. O02 저장/복제/삭제는 각각 단일 RPC로 처리하며 회원별 코디 잠금과 의류 SHARE 잠금 안에서 소유권/active/분류/중복/최소 구성을 강제한다. updated_at 충돌 검사를 사용하고 같은 ID/정확히 같은 저장 결과 재시도는 무변경 성공이다. 기존 코디 폼은 snapshot을 유지해 실패나 재조회가 초안을 덮어쓰지 않는다. 쓰기 서비스는 시작 토큰을 고정하며 회원별 Query/취소/해제 epoch 경계를 적용한다.

NavigationGuardProvider는 새 코디/기존 코디 편집의 미저장 메뉴 이탈 확인을 등록한다. 공통 헤더/메뉴 GuardedLink가 이동 전 확인을 요청하며 Expo usePreventRemove는 뒤로 가기/화면 제거와 beforeunload를 담당한다. 인증 경계 때문에 화면이 직접 해제되는 경우는 경고보다 개인 초안 폐기를 우선한다. 기존 인증 callback의 마운트 수명주기는 변경하지 않는다.

사진은 상세에서 선택 → 플랫폼별 디코딩/재인코딩 → 예약 RPC → Storage 업로드 → 완료 RPC로 저장한다. ready만 목록 대표 사진과 상세 썸네일에 노출한다. 사진 service는 작업 시작 회원의 토큰을 고정하고 요청 취소를 Storage까지 전달한다. signed URL은 TTL 60초의 조회 결과로만 취급하며 DB/로컬 저장소에 저장하지 않는다. pending 예약은 재접속 후 상세에서 완료/정리한다. 대표 교체/삭제는 DB 잠금과 RPC를 사용한다.

옷장/코디는 soft delete, 착용 기록은 저장 시 item 목록을 별도 복사한다. 코디 저장/복제와 착용 기록 저장은 각 단일 RPC 트랜잭션으로 처리한다. 통계는 RLS를 따르는 invoker view 또는 RPC를 사용한다. 실제 개인정보를 fixture에 넣지 않으며, 필요한 개발 fixture는 다음 기능 단계에 한해 분리한다.

착용 생성은 코디 버전 또는 수동 UUID를 검증해 이벤트/당시 의류 ID를 함께 저장한다. H02 편집은 기본 keep 모드로 날짜/메모만 수정하며 명시적 교체 때만 새 구성/출처를 저장한다. 수정·삭제는 이벤트별 잠금/CAS/단조 증가 timestamp를 사용한다. 삭제 tombstone은 기존 생성 재시도에 의한 부활을 막으며 목록·일별 건수·통계·의류 참조 집계에서 제외된다. 생성 validator는 app_private 내부 함수이고 공개 wrapper만 실행을 허용한다. 상세는 `PHASE_11_VALIDATION.md`다.

착용 화면은 월별 wear_day_counts와 선택일 20개 목록을 따로 읽어 페이지 밖의 건수도 표시한다. FormScreen은 새 기록/기존 snapshot 편집을 공유하며 날짜·메모와 코디/의류 선택을 분리한다. 기존 기록과 입력을 백그라운드 조회로 덮어쓰지 않고 최신 내용으로 교체할 때 확인한다. 저장 후 해당 날짜 달력으로 복귀하며 관련 회원 Query를 취소·무효화한다. 직접 테이블 쓰기는 닫혀 있다. 당시 구성은 의류 ID 집합이며 이름·가격·사진은 현재 의류 값을 읽는다.

I01은 security invoker의 insight_item_stats를 공통 의류별 관계로 사용한다. 요약 RPC는 해당 관계 전체를 PostgreSQL에서 materialize해 카테고리·브랜드·통화별 합계를 계산하므로 클라이언트/API 행 제한이 총계를 잘라내지 않는다. 목록 RPC는 기간 내 횟수와 기준일까지 누적 비용을 구분하고 20개 서버 페이지를 반환한다. 이벤트/일수/의류 착용 수는 과거 기록, 의류 분포·가격은 현재 등록 정보다. 기준일 이후·삭제 기록과 현재 휴지통 의류는 각각 해당 집계에서 제외한다. 회원별 캐시는 기준일/기간/목록 조건을 포함하며 의류 생성·변경과 착용 쓰기에서 무효화한다.
