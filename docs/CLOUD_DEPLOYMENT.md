# 공용 데이터와 웹 배포

기준일: 2026-11-03.

- 운영 주소: https://closet.itsmesungjun.chatgpt.site
- 대상 선언: `deployment/target.json`, 사이트 ID: `.openai/hosting.json`.
- Supabase 프로젝트: `kbidufigaybjrdmipwmu` (서울, PostgreSQL 17).
- 사이트는 소유자 전용이며, CLOSET 계정 로그인은 별도입니다. 다른 PC/휴대폰에서 사이트 이용 시 개발용 PC를 켤 필요가 없습니다.
- 운영 스키마에는 `20261102042345_outfit_layering.sql`과 `20261102052120_member_usage_quotas.sql`까지 적용했습니다. 기존 자료를 reset하거나 일괄 삭제하지 않았습니다.

## 다른 PC의 개발 환경

```powershell
git pull --ff-only
npm ci
npx supabase login
npm run env:cloud
npm run web
```

Git은 소스를 동기화하고 실제 옷장 자료는 공용 Supabase에 저장합니다. 공용 환경에서 수정·삭제하면 실제 자료에 반영됩니다. 이전 개인 로컬 자료/DB dump는 `.local-backups/`에 보관하며 Git과 배포에서 제외합니다. Auth 해시·개인 사진이 포함된 백업은 공유하지 않습니다.

## 스키마 변경

로컬에서 변경·검증하고 advisor 확인 후 CLI로 migration을 생성합니다. 생성 SQL의 관련 변경·정책·함수 권한을 검토하고 dry-run으로 적용 목록을 확인한 뒤 해당 프로젝트에만 push합니다. 이미 적용한 migration은 수정하지 않고 새 migration으로 이어갑니다. Storage 파일은 Storage API로 처리합니다.

## Auth 주소

현재 Site URL과 callback은 운영 주소에 맞췄습니다. 과거 `wellpin12.chatgpt.site` callback과 개발용 localhost/custom scheme은 기존 링크·개발 호환을 위해 유지합니다.

`deployment/public-auth/supabase/config.toml`은 URL 두 항목만 선언한 설정입니다. 다음 명령으로 범위를 확인할 수 있습니다.

```powershell
npx supabase config diff --workdir deployment/public-auth --project-ref kbidufigaybjrdmipwmu
```

로컬 `supabase/config.toml`을 운영에 통째로 push하지 않습니다. `scripts/check-public-registration.mjs`가 만드는 `test-results/public-auth-readiness` 설정은 **비교용**이며 push하지 않습니다.

## 웹 빌드·배포

`npm run build`는 `.env.cloud.local`의 공개 값과 운영 대상을 검증한 뒤 Expo 웹 export를 만듭니다. 공개 산출물에서 서버 키/JWT·개인 키·로컬 API 주소를 검사하고 SPA fallback으로 직접 경로 접속을 지원합니다. 환경 변수 변경은 재빌드해야 반영됩니다.

Sites의 기존 소스를 열고 공식 source helper로 검사·빌드·commit/push·archive를 준비한 다음 그 결과의 정확한 SHA와 archive로 버전을 배포합니다. 현재 owner-private 범위는 유지합니다. GitHub `origin/main`에도 같은 커밋을 push합니다.

## 공개 테스트 대기 사항

현재 공개 가입은 꺼져 있고 외부 SMTP·운영 CAPTCHA는 미연결입니다. 앱의 가입 준비 코드와 사용량 제한을 배포하는 것만으로 공개 테스트가 시작되지는 않습니다. [공개 가입 안내](PUBLIC_SIGNUP.md)의 외부 서비스 연결·메일/보안 확인 검증을 완료한 뒤 가입과 사이트 공개 범위를 전환합니다.

운영 준비 확인:

```powershell
node scripts/check-public-registration.mjs
# 실제 공개 전환 완료 후 모든 조건 확인
node scripts/check-public-registration.mjs --require-open
```

실제 외부 수신자 메일·운영 CAPTCHA·독립 회원의 사이트 접속과 네이티브 실기기는 별도 확인합니다.
