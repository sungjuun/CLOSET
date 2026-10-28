# CLOSET.

개인 디지털 옷장: PC 웹 · iOS · Android 공통 Expo/TypeScript 기반.

로컬 Supabase 보안·이메일 인증, 회원별 의류 관리와 비공개 사진/검색/휴지통, 코디 슬롯 초안 편집과 저장 코디 읽기 목록을 구현했습니다. 업로드한 UI 레퍼런스에 맞춘 PC·모바일 공통 헤더와 목록을 적용했습니다. 코디 서버 저장·수정·삭제, 착용 기록·통계는 후속 단계입니다. 신규 가입은 서버에서 제한하며 기본 운영은 초대 계정 방식입니다.

## 실행

Node **22.23.2** (22 LTS) / npm 10 기준입니다.

```powershell
npm ci
npm run db:start
npm run db:migrate
npm run env:local
npm run web
```

Docker Desktop Linux 엔진이 필요합니다. `env:local`은 기존 `.env.local`을 덮어쓰지 않으며 로컬 Supabase의 공개 연결 값만 작성합니다. 테스트 계정은 자동 정리되므로 실제 사용할 계정은 로컬 Studio에서 별도로 준비하세요. 키가 없으면 로그인 설정 안내 화면을 볼 수 있습니다.

모바일 개발 서버는 `npm start`, Android emulator는 `npm run android`, iOS는 Mac/실기기 또는 EAS 개발 빌드가 필요합니다. 실기기의 PC 연결 설정은 ENVIRONMENT.md를 확인하세요.

호스팅 Supabase를 연결할 때:

```powershell
Copy-Item .env.example .env.local
# .env.local에 개발 프로젝트 URL / publishable key 입력
```

검증된 migration과 Auth redirect/이메일 설정을 해당 개발 프로젝트에 적용해야 합니다. 원격 배포는 아직 수행하지 않았습니다. 비밀 키를 EXPO_PUBLIC 변수에 넣지 마세요. production 번들은 HTTPS Supabase가 필요합니다.

## 확인 명령

```powershell
npm run check
npm run web:measure # 실행 중인 8081 웹 서버 응답 속도 확인
npm run db:test
npx supabase db lint --local --level warning
npx expo install --check
npx expo-doctor
npm run export:web
npm run export:native
```

native export는 JS 번들 검사이며 실기기/스토어 빌드 성공을 의미하지 않습니다. 웹 배포 시 SPA rewrite를 설정해야 직접 URL 접근이 동작합니다.

## 설계와 다음 작업

- [웹 지연 측정 결과와 재점검 방법](docs/WEB_PERFORMANCE.md)
- [레퍼런스 UI 변경과 검증](docs/UI_REFRESH_VALIDATION.md)

- [구조/공통 컴포넌트](docs/ARCHITECTURE.md)
- [회원 분리/SQL 보완 검토](docs/SECURITY.md)
- [작은 작업 단위와 의존 순서](docs/TASKS.md)
- [환경값/외부 서비스 준비](docs/ENVIRONMENT.md)
- [결정 사항](docs/DECISIONS.md)
- [UI 레퍼런스 분석](docs/UI_REFERENCE_REVIEW.md)
- [현재 코디 슬롯 편집 단계 검증](docs/PHASE_07_VALIDATION.md)
- [의류 수정·상태·휴지통 단계 검증](docs/PHASE_06_VALIDATION.md)
- [검색·필터·정렬 단계 검증](docs/PHASE_05_VALIDATION.md)
- [사진 업로드 단계 검증](docs/PHASE_04_VALIDATION.md)
- [의류 등록·조회 단계 검증](docs/PHASE_03_VALIDATION.md)
- [인증·보안 단계 검증](docs/PHASE_02_VALIDATION.md)
- [초기 기반 검증 기록](docs/VALIDATION.md)

원본 기획서/SQL/프롬프트는 `docs/`에, UI 이미지 3장은 `docs/reference/`에 보존했습니다. 의류 등록·사진·검색·수정·상태·휴지통에 이어 `/outfits/new`에서 7개 슬롯의 코디를 조합할 수 있습니다. 현재 코디는 메모리 초안이며 서버에 저장하지 않습니다. 로컬 300개 목록/API와 웹 편집을 검증했고 모바일 실기기 확인은 남아 있습니다. 다음 개발은 O02 원자적 코디 저장·수정·복제·삭제입니다.
