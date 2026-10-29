# 환경 변수와 외부 서비스 설정

## 로컬 실행

Node 22.23.2 / npm 10을 기준으로 `npm ci` 후 Docker Desktop을 시작하고 `npm run db:start`, `npm run db:migrate`, `npm run env:local`, `npm run web` 순서로 실행한다. 이미 존재하는 `.env.local`은 자동 덮어쓰지 않는다. 인증과 의류 등록/목록/상세, private 사진 업로드가 동작한다. 환경값이 없으면 로그인 설정 안내 화면이 실행된다.

`.env.example`을 `.env.local`로 복사해 아래 공개 설정을 입력한다. 실제 값은 커밋하거나 채팅/로그에 붙여 넣지 않는다.

| 변수 | 실행 위치 | 필요 시점 | 설명 |
| --- | --- | --- | --- |
| EXPO_PUBLIC_SUPABASE_URL | 웹/앱 번들 | 인증 단계 | 개발/스테이징 프로젝트의 HTTPS origin. 로컬 개발만 loopback/LAN HTTP 허용 |
| EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 웹/앱 번들 | 인증 단계 | `sb_publishable_...`. 로컬 CLI의 legacy anon JWT도 허용. service_role은 거부 |
| SUPABASE_ACCESS_TOKEN | CLI/CI 비밀 저장 | 원격 연결/배포 | 개인 CLI 토큰, 앱 환경에 넣지 않음 |
| SUPABASE_DB_PASSWORD | CLI/CI 비밀 저장 | 원격 migration | DB 접속 비밀번호, 앱 환경에 넣지 않음 |
| SUPABASE_SERVICE_ROLE_KEY 또는 새 secret key | Edge Function 서버 비밀 저장 | 향후 관리자 작업 | RLS 우회 가능. EXPO_PUBLIC 접두사/클라이언트 코드 사용 금지 |
| EXPO_TOKEN | CI 비밀 저장 | 향후 EAS 빌드 | Expo 자동화 토큰, 로컬 앱 실행에는 불필요 |
| AI 공급자 API key | 서버 비밀 저장 | 선택적 P2 | 현재 사용하지 않으며 발급 불필요 |

서버 비밀 값은 클라이언트용 `.env.example`이나 `.env.local`에 넣지 않는다. CLI/CI/서버의 비밀 저장소를 사용한다. CLI 로그인은 대화형 `npx supabase login`으로 진행할 수 있다. Query/dev 로그에 인증 값·개인 메모·signed URL을 기록하지 않는다.

## Supabase 준비 순서

1. Docker Desktop Linux engine을 시작한 뒤 `npm run db:start`. 기본 로컬 API 54321 / DB 54322 / Studio 54323 / Mailpit 54324를 사용한다. 신규 DB에는 브랜드 관리까지 migration 총 14개가 적용된다. Windows 사용자 설치에서 docker 명령이 안 보이면 Docker Desktop의 resources/bin 경로를 현재 셸 PATH에 추가하거나 새 터미널을 연다.
2. 기존 로컬 환경에는 `npm run db:migrate`로 새 migration만 적용한다.
3. `npm run env:local`로 공개 로컬 연결 설정만 작성한다. service_role은 작성하지 않는다.
4. `npm run db:test`로 두 계정/anon/Storage/Auth를 검증한다. 테스트는 loopback 54321만 허용하고 자신이 만든 fixture 계정/파일/메일만 정리한다.
5. 빈 환경 재현이 필요한 경우 `npx supabase db reset --local`을 사용한다. 모든 로컬 데이터가 삭제되므로 보존할 데이터가 없는 개발 DB에서만 수행한다. 일반 실행에 reset은 필요하지 않다.
6. `npm run db:types`로 검증된 DB 타입을 생성한다. 실패 시 기존 타입 파일을 덮어쓰지 않는다.
7. 호스팅 환경은 개발/스테이징/운영을 분리한다. 원격 target 확인과 migration/설정 적용은 별도이며 현재 원격 연결/배포는 수행하지 않았다.

## Auth / Storage 설정 체크

- 신규 가입은 `auth.enable_signup=false`로 제한하고 이메일 공급자 `auth.email.enable_signup=true`는 유지한다. 후자를 끄면 기존 계정 이메일 로그인도 막힌다. 기본 초대 운영용이며 공개 가입 완주 검증은 가입 정책 변경 단계에서 수행한다.
- `/auth/callback`에서 PKCE 코드를 교환하고 `/auth/update-password`에서 새 비밀번호를 저장한다. 로컬 redirect는 `http://localhost:8081/auth/callback`, `http://127.0.0.1:8081/auth/callback`, `closet://auth/callback`만 등록했다. 웹/네이티브는 링크를 요청한 기기와 브라우저에서 열어야 한다. Expo Go 대신 custom scheme가 설치된 development build가 필요하다.
- 호스팅에서는 실제 서비스 Site URL, 정확한 callback allowlist, SMTP/발신 도메인을 별도로 설정한다. 임의 `next` URL이나 광범위 wildcard를 사용하지 않는다. 로컬 메일은 Mailpit에만 배달되며 실제 외부 메일을 보내지 않는다.
- `wardrobe-private`는 public=false, 5MiB, JPEG/PNG/WebP다. 유효한 본인 의류의 DB 사진 예약을 먼저 만들고 해당 경로에만 업로드한다. 삭제는 객체 → 예약 순서다. 객체 덮어쓰기/이동은 닫혀 있다.
- 모바일 실기기는 `localhost`로 PC Supabase에 연결할 수 없다. 개발 PC LAN IP와 방화벽 설정을 사용하고 같은 네트워크에서 테스트한다. API를 공용 네트워크에 노출하지 않는다.
- 현재 자동 생성한 `.env.local`은 PC 웹용 loopback 설정이다. production export는 컴파일 검증이며 실제 배포 시 HTTPS Supabase 설정이 필요하다. production에서 로컬 HTTP 설정은 의도적으로 거부한다.
- 탈퇴는 Storage 파일 삭제 후 계정/DB 정리를 수행하는 서버 프로세스로 추가한다.

## Expo / 플랫폼별 준비

- BR02 브랜드 삭제는 `20261029030000_brand_deletion.sql`(현재 총 16개 migration)을 사용한다. 로컬 적용과 생성 타입 갱신을 완료했다. 기존 사진 어댑터에 브랜드용 정사각형 맞춤 옵션을 추가했으며 새 환경 변수/패키지/외부 서비스는 없다. 다른 PC는 `npm run db:migrate`가 필요하고 원격에는 적용하지 않았다.

- CT01 `/categories`는 `20261029020000_member_categories.sql`(총 15개 migration)과 생성 DB 타입을 사용한다. 로컬에 적용했으며 추가 환경 변수/외부 서비스는 없다. 다른 PC에서는 `npm run db:migrate`를 실행한다. 원격에는 적용하지 않았다.

- 웹: `npm run web`; 배포 호스트는 SPA deep link를 `/index.html`로 rewrite해야 한다.
- W03 검색/필터는 기존 Supabase의 읽기 RPC를 사용한다. 추가 패키지/환경 변수/검색 외부 서비스는 없다. 호스팅에서도 `20261028030000_wardrobe_search.sql` 적용이 필요하며 현재 원격에는 적용하지 않았다.
- W04 수정/상태/휴지통은 기존 RLS 쓰기 권한과 updated_at 비교를 사용한다. 코디/착용 참조 안내는 `20261028040000_wardrobe_usage.sql` 읽기 RPC다. 새 패키지/환경 변수/외부 서비스/Realtime 설정은 없다. 다른 세션 변경은 재진입/포커스/새로고침 때 조회하며 실기기 동기화는 별도 검증한다.
- 코디 편집은 기존 의류 읽기 RPC/테이블/private 사진을 재사용하며 SDK 58의 usePreventRemove와 앱 메뉴 이탈 확인을 사용한다. O02 저장/수정/복제/삭제는 `20261028050000_outfit_writes.sql`의 인증된 RPC로만 쓰며 호스팅에서도 migration 적용이 필요하다. 새 패키지/환경 변수/외부 서비스는 없다.
- O03 저장 코디 검색/필터/선택지는 `20261028060000_outfit_search.sql`의 읽기 RPC를 사용한다. 기존 호스팅 연결에는 이 migration도 적용해야 한다. 새 패키지/환경 변수/외부 서비스는 없다.
- H01 착용 기록 생성/조회는 `20261028070000_wear_snapshots.sql`, H02 달력 건수/수정/삭제/통계 제외는 `20261028080000_wear_calendar.sql`과 생성 DB 타입을 사용한다. `/calendar`와 `/wear/new`, `/wear/[eventId]`를 연결했다. 새 패키지/환경 변수/외부 서비스는 없다. 호스팅에는 아직 적용하지 않았다.
- I01 `/insights`는 `20261028090000_insights.sql`의 읽기 RPC와 생성 DB 타입을 사용한다. 기준일은 기기의 지역 날짜를 기본으로 하며 서버 current_date에 의존하지 않는다. 새 패키지/환경 변수/외부 서비스는 없고 호스팅에는 아직 적용하지 않았다.
- BR01 `/brands`와 의류 브랜드 선택은 `20261028100000_brands.sql`의 회원별 테이블/쓰기 RPC/brand-private bucket을 사용한다. 기존 브랜드명 이관을 포함하며 로컬 DB에 적용했다. 새 패키지/환경 변수는 없고 원격에는 적용하지 않았다.
- 사진: SDK 호환 `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`을 사용한다. 새 환경 변수/외부 이미지 서비스는 없다. 웹은 사용자 동작으로 파일 선택창을 열고 브라우저 디코더/canvas로 변환한다. 브라우저에서 디코딩하지 못하는 HEIC는 JPEG/PNG/WebP로 바꿔 선택해야 한다.
- 네이티브는 `app.json`의 image-picker 플러그인으로 사진/카메라 권한 설명을 선언했다. 촬영 버튼에서 카메라 권한을 요청하며 마이크 권한은 추가하지 않는다. 네이티브 설정 변경은 development build 재생성이 필요하다. 실제 iOS/Android 권한·촬영·HEIC는 기기 검증이 남아 있다.
- Android: Expo Go 호환 SDK 확인 또는 development build, Android Studio emulator/실기기 준비.
- iOS: Windows에서는 로컬 Xcode 빌드를 할 수 없다. 실기기 Expo Go 호환 확인 또는 EAS development build/Mac이 필요하다.
- SDK 58 전환기에는 Expo Go가 아직 이전 SDK일 수 있다. 공식 안내와 설치된 클라이언트 버전을 확인하고 필요하면 development build를 사용한다.
- EAS project ID, iOS bundleIdentifier, Android package, 서명, 스토어 계정은 배포 단계에 확정한다. 지금은 임의 ID/개발자 계정/유료 서비스가 필요하지 않다.
- 모니터링/분석/상품 추출/AI 키는 기반 실행에 필요하지 않다. 도입 시 서버 권한과 사용량 상한을 별도 설계한다.

근거: [Expo 환경 변수](https://docs.expo.dev/guides/environment-variables/), [Expo SDK 58](https://expo.dev/changelog/sdk-58), [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native).
