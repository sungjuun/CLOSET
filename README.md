# CLOSET.

개인 디지털 옷장: PC 웹 · iOS · Android 공통 Expo/TypeScript 기반.

가격은 원화만 사용합니다. 옷장 목록은 상세 필터 없이 분류·검색·색상·즐겨찾기·정렬을 제공합니다. [변경과 검증](docs/KRW_UI_VALIDATION.md)

**설정 → 카테고리 관리**에서 옷 종류·세부 분류의 이름/순서/사용 여부를 수정하고 세부 분류를 추가합니다. 변경은 본인에게만 적용하며 숨겨도 기존 옷과 코디는 유지합니다. [카테고리 관리·검증](docs/CATEGORIES_VALIDATION.md)

옷 종류는 아우터·상의·하의·신발·가방·액세서리 6종을 표시하며 종류와 세부 분류 모두 손잡이를 드래그해 순서를 바꿉니다. 원피스·셋업은 관리/새 등록 선택지에서 제외하고 기존 데이터는 보존합니다. [드래그 정렬·검증](docs/CATEGORY_DRAG_VALIDATION.md)

로컬 Supabase 보안·이메일 인증, 회원별 의류 관리와 비공개 사진/검색/휴지통, 코디 편집·저장·검색, 착용 월 달력과 기록 CRUD를 구현했습니다. `/insights`에서 전체·30일·90일 기록, 현재 의류/브랜드/카테고리 분포, 원화 구매가, 의류별 누적 착용당 비용을 볼 수 있습니다. 브라우저·실기기 검증은 사용자 요청으로 보류하고 코드·DB·번들 검증을 진행합니다. 신규 가입은 서버에서 제한하며 기본 운영은 초대 계정 방식입니다.

상단 **설정 → 브랜드 관리**에서 브랜드명·이미지를 등록한 뒤 옷 추가·수정에서 검색해 선택할 수 있습니다. 로고는 옷장 카드와 의류 상세에도 표시합니다. 기존 브랜드명은 목록으로 이관합니다. [구현·검증 기록](docs/BRANDS_VALIDATION.md)

브랜드를 선택하면 삭제할 수 있습니다. 삭제 시 옷·사진·코디는 유지하고 옷의 브랜드 정보만 해제합니다. 새 브랜드 이미지는 중앙 정사각형으로 자동 맞추며 저장 전 미리보기로 확인합니다. [삭제·이미지 맞춤 검증](docs/BRAND_DELETION_VALIDATION.md)

브랜드·카테고리 등록/수정은 상단 **설정** 메뉴로 모았습니다. PC와 모바일에서 같은 설정 화면을 사용합니다. [설정 메뉴 변경](docs/SETTINGS_UI_VALIDATION.md)

**설정 → 화면 테마**는 회원 계정에 자동 저장하고 다음 로그인에도 복원합니다. 같은 서버를 사용하는 기기에서 같은 설정을 불러옵니다. [테마 저장·검증](docs/THEME_PERSISTENCE_VALIDATION.md)

설정은 분할 탐색형으로 일반 / 옷장 관리 / 기록·통계 / 계정·보안을 제공합니다. 일반에서 옷장·코디 기본 정렬과 카드 밀도를, 계정·보안에서 프로필 이름을 저장합니다. 모두 회원별로 유지됩니다. [설정 개편·검증](docs/SETTINGS_SPLIT_VALIDATION.md)

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
- [저장한 코디 카드·이름 저장·삭제 UI와 검증](docs/OUTFIT_CATALOG_REFRESH.md)

- [구조/공통 컴포넌트](docs/ARCHITECTURE.md)
- [회원 분리/SQL 보완 검토](docs/SECURITY.md)
- [작은 작업 단위와 의존 순서](docs/TASKS.md)
- [환경값/외부 서비스 준비](docs/ENVIRONMENT.md)
- [결정 사항](docs/DECISIONS.md)
- [UI 레퍼런스 분석](docs/UI_REFERENCE_REVIEW.md)
- [코디 슬롯 초안 편집 단계 검증](docs/PHASE_07_VALIDATION.md)
- [코디 저장·수정·복제·삭제 단계 검증](docs/PHASE_08_VALIDATION.md)
- [저장 코디 검색·필터 단계 검증](docs/PHASE_09_VALIDATION.md)
- [착용 기록 스냅샷 저장·조회 기반 검증](docs/PHASE_10_VALIDATION.md)
- [월 달력·착용 기록 CRUD 검증](docs/PHASE_11_VALIDATION.md)
- [기간별 통계·누적 착용당 비용 검증](docs/PHASE_12_VALIDATION.md)
- [의류 수정·상태·휴지통 단계 검증](docs/PHASE_06_VALIDATION.md)
- [검색·필터·정렬 단계 검증](docs/PHASE_05_VALIDATION.md)
- [사진 업로드 단계 검증](docs/PHASE_04_VALIDATION.md)
- [의류 등록·조회 단계 검증](docs/PHASE_03_VALIDATION.md)
- [인증·보안 단계 검증](docs/PHASE_02_VALIDATION.md)
- [초기 기반 검증 기록](docs/VALIDATION.md)

원본 기획서/SQL/프롬프트는 `docs/`에, UI 이미지 3장은 `docs/reference/`에 보존했습니다. `/outfits/new`에서 코디를 만들고 `/calendar`에서 착용 기록을 관리합니다. `/insights`는 기준일 이후와 삭제된 기록을 제외하며, 누적 비용은 현재 구매가/기준일까지 전체 기록 수로 계산합니다. 가격은 원화만 사용하며, 가격 미입력/0회 기록을 구분합니다. 다음 개발은 L01 HTTPS 상품 URL 서버 검증입니다. 최신 근거는 `PHASE_12_VALIDATION.md`를 참조하세요. 실제 화면·실기기 검증은 보류 상태로 남아 있습니다.
