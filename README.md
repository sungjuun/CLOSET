# CLOSET.

PC 웹과 iOS·Android에서 코드를 공유하는 개인 디지털 옷장입니다. Expo + React Native + TypeScript를 사용하고, 계정·데이터·비공개 이미지는 Supabase에 보관합니다.

**웹 주소:** [closet.itsmesungjun.chatgpt.site](https://closet.itsmesungjun.chatgpt.site)

**현재 운영:** 사이트는 소유자 전용이며 공개 회원가입은 닫혀 있습니다. 이메일 인증은 사용 중이고, 외부 회원용 SMTP·Turnstile 연결은 준비 단계입니다.

## 구현된 기능

| 영역 | 제공 기능 |
| --- | --- |
| 내 옷장 | 의류 등록·수정, 분류·검색·즐겨찾기·정렬, 구매처 링크, 원화 가격, 상태 관리·휴지통·복원 |
| 사진 | 의류당 최대 5장, 대표 사진, 원본 비율을 유지하는 표시, 비공개 저장·다운로드 |
| 코디 만들기 | 실제 보유 의류 선택, 아우터·상의 각각 최대 3벌 겹쳐 입기, 안쪽·바깥쪽 순서 변경 |
| 저장한 코디 | 이름 수정·검색·계절 필터·정렬, 재편집·복제·삭제, 플랫레이 이미지 저장 |
| 코디 추천 | 보유 의류 기반 색상 중심 추천, 상황·스타일·계절, 아이템 고정·교체·재추천, 최근 착용 제외 |
| 색상 조합·스타일 가이드 | 상의·하의 배색, 랜덤·찜·비교·이미지 저장, 주제별 스타일 정보 |
| 기록·통계 | 착용 달력과 당시 의류 스냅샷, 기간별 통계·착용당 비용 |
| 설정 | 브랜드·로고 관리, 종류·세부 분류 편집·삭제·드래그 정렬, 테마·정렬·밀도·프로필 |
| 백업·복원 | JSON, 열람용 CSV ZIP, 원본 사진 포함 ZIP, 동일 계정 복원·파일 전송 재개 |
| 회원별 사용량 | 의류 300개, 이미지 합계 100MiB·500개 기본 한도, 서버 검증·설정 화면 집계 |

테마는 화이트·베이지·다크입니다. 공지·메모·마네킹과 카테고리 사용 여부 스위치는 현재 제품 범위에서 제외했습니다. 옷장 목록의 색상 드롭다운도 제거했습니다. 기존 회원 자료와 과거 착용 기록은 보존합니다.

## 개발 시작

Node 22.23.x, npm, Docker Desktop의 Linux 엔진을 사용합니다.

**로컬 데이터로 개발·테스트:**

```powershell
npm ci
npm run db:start
npm run db:migrate
npm run env:local
npm run web
```

`.env.local`이 이미 공용 서버를 가리킨다면 [환경 안내](docs/ENVIRONMENT.md)를 먼저 확인하세요. `env:local`은 기존 파일을 자동으로 덮어쓰지 않습니다. 테스트는 별도 임시 계정을 생성·정리합니다.

**다른 PC에서 같은 공용 데이터로 개발:**

```powershell
git pull --ff-only
npm ci
npx supabase login
npm run env:cloud
npm run web
```

공용 연결로 등록·수정·삭제한 내용은 실제 자료에 반영됩니다. 사이트 이용만 할 때는 위 웹 주소로 접속하면 되며 개발 서버를 켤 필요가 없습니다.

## 검사·빌드

```powershell
npm run check                       # 타입 검사·ESLint·단위 테스트
npm run db:test                     # 로컬 DB·Auth·Storage 통합 테스트
npm run export:native               # Android/iOS JS 번들 확인
npm run build                       # 공용 연결 웹 빌드·공개 산출물 검사
node scripts/check-public-registration.mjs # 읽기 전용 가입 준비 상태 확인
```

네이티브 export는 실기기 설치·스토어 배포 검사와 다릅니다. 사이트 배포는 [배포 안내](docs/CLOUD_DEPLOYMENT.md)를 따릅니다.

## 프로젝트 문서

- [현재 상태·검증·남은 작업](docs/PROJECT_STATUS.md)
- [다음 작업과 우선순위](docs/TASKS.md)
- [폴더·모듈·데이터 구조](docs/ARCHITECTURE.md)
- [환경 변수·다른 PC 개발](docs/ENVIRONMENT.md)
- [운영 서버·웹 배포](docs/CLOUD_DEPLOYMENT.md)
- [공개 가입 준비·외부 서비스 연결](docs/PUBLIC_SIGNUP.md)
- [데이터 분리·보안](docs/SECURITY.md)
- [백업·복원](docs/BACKUP_RESTORE.md)
- [겹쳐 입기](docs/OUTFIT_LAYERING.md)
- [실사용 검증 기록](docs/USABILITY_VALIDATION.md)
- [이전 개발 이력](docs/history/TASKS_2026-11-02.md)

원본 기획서·SQL·프롬프트와 UI 참고 이미지는 `docs/` 및 `docs/reference/`에 보존했습니다. 과거 단계 문서의 미완료 표시는 작성 당시 상태이므로 현재 판단은 `PROJECT_STATUS.md`를 우선합니다.
