# 개발 환경과 환경 변수

기준일: 2026-11-03. 프로젝트는 Node 22.23.x와 npm, Expo 58을 사용합니다. 로컬 DB 테스트에는 Docker Desktop Linux 엔진이 필요합니다.

## 로컬 DB로 개발

```powershell
npm ci
npm run db:start
npm run db:migrate
npm run env:local
npm run web
```

`env:local`은 실행 중인 로컬 Supabase의 공개 키만 작성합니다. `.env.local`이 이미 있으면 덮어쓰지 않으므로 먼저 대상 URL을 확인하세요. 공용 설정에서 로컬로 바꾸려면 기존 `.env.local`을 Git 제외된 안전한 위치로 보관한 뒤 다시 생성합니다. `env:cloud`는 변경 전 환경 파일을 `.local-backups/`에 보관합니다.

## 공용 DB로 개발

```powershell
git pull --ff-only
npm ci
npx supabase login
npm run env:cloud
npm run web
```

이 연결의 쓰기는 실제 공용 자료를 변경합니다. 데이터 테스트 스크립트는 loopback의 별도 임시 계정만 사용합니다. 사이트만 이용할 때는 로컬 서버가 필요 없습니다.

## 공개 환경 변수

`.env.example`에 형식을 보관하고 실제 값은 `.env.local`/`.env.cloud.local`에 둡니다.

| 변수 | 용도 |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | 개발/운영 Supabase API origin. 배포에서는 지정한 HTTPS 프로젝트만 허용 |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 클라이언트 공개 키. service_role·서버 secret은 거부 |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | 실제 Turnstile **공개 사이트 키**. 연결 전에는 비움 |
| `EXPO_PUBLIC_WEB_ORIGIN` | 네이티브 보안 확인 페이지의 HTTPS origin. 운영 사이트와 일치해야 함 |

`EXPO_PUBLIC_*`는 누구나 볼 수 있는 번들에 포함됩니다. SMTP 비밀번호, Turnstile **시크릿**, Supabase 서버 키·CLI 토큰은 넣지 않습니다. SMTP/시크릿은 서비스 대시보드에 직접 입력합니다.

`env:cloud`는 기존 공개 Turnstile 키를 유지하면서 운영 URL·공개 연결을 갱신합니다. `npm run build`는 `.env.cloud.local`만 읽고 임의 공개 변수·서버 비밀·로컬 API 주소 유입을 검사합니다. CAPTCHA 테스트 키는 운영 빌드에서 거부합니다.

## 검사와 생성

- `npm run check`: 타입·ESLint·단위 검사.
- `npm run db:test`: 로컬 DB/Auth/Storage·경합·회원 분리·복원·가입 흐름 검사.
- `npm run db:types`: 로컬의 검증된 공개 DB 타입 생성.
- `npm run export:native`: Android/iOS JS 번들 검사.
- `npm run build`: 운영 연결 웹 산출물 생성·검사.
- `node scripts/check-public-registration.mjs`: 운영 설정 읽기 전용 확인.

네이티브 사진/카메라·파일·공유·캡처·WebView 모듈이 추가된 경우 해당 모듈을 포함한 development build가 필요합니다. Windows에서 iOS 설치 빌드/실기기 성공을 확인한 것으로 간주하지 않습니다. 서명·스토어·EAS 계정 설정은 별도 단계입니다.

현재는 SMTP·Turnstile의 실제 외부 계정 연결이 남아 있습니다. [공개 가입 연결 순서](PUBLIC_SIGNUP.md)를 확인하세요.
