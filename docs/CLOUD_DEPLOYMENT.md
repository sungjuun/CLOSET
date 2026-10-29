# 집·회사 공용 데이터와 웹 배포

2026-10-29. 공용 대상은 `deployment/target.json`, 웹 호스팅 ID는 `.openai/hosting.json`에서 관리한다. 계정 비밀번호·CLI 토큰·서버 키는 소스에 저장하지 않는다.

- 웹 주소: https://closet.wellpin12.chatgpt.site
- Supabase: `kbidufigaybjrdmipwmu`, 서울, PostgreSQL 17. 무료 조직의 프로젝트다.
- 웹은 소유자 전용 Sites 접근을 유지한다. 같은 ChatGPT 계정으로 접근하고 앱에서는 기존 CLOSET 계정으로 로그인한다.
- 집과 회사에서 같은 웹 주소를 사용한다. PC/Docker/Metro를 켜둘 필요가 없다. Git pull은 소스 변경을 가져오는 용도이며 실제 옷장 데이터는 공용 Supabase에 저장된다.

같은 날 기본 주소의 앞부분을 `closet-sungjuun`에서 `closet`으로 줄였다. Site ID, 비공개 접근, Supabase 프로젝트와 기존 데이터는 동일하다. Supabase Site URL과 새 callback을 맞췄으며 이전 callback은 기존 메일 링크 호환을 위해 allowlist에 유지한다. 북마크는 새 웹 주소를 사용한다.

## 이번 이전

로컬 원본을 읽기 전용으로 백업한 뒤 18개 migration을 빈 원격 프로젝트에 적용했다. 기존 계정 UUID·비밀번호 해시·identity·프로필·설정을 그대로 가져왔다. 옷 5개, 코디 1개와 구성 2개, 브랜드 15개, 카테고리 22개와 회원별 설정 13개, 사진/로고 파일 19개를 이전했다. 공개/비공개·삭제 상태와 기존 객체 경로도 유지한다. 착용 기록과 import job은 0개다.

13개 데이터 테이블의 전체 행을 대조했고 19개 파일을 서버에서 다시 내려받아 SHA-256을 대조했다. 임시 원격 계정 2개로 비밀번호 로그인·타 회원 조회/쓰기 차단·익명 접근 차단을 확인하고 fixture만 정리했다. 두 Storage bucket은 비공개/5MiB 제한이다. 실제 사용자의 기존 세션은 복제하지 않으므로 새 주소에서 다시 로그인해야 한다.

`.local-backups/`에는 DB 전체 custom dump, JSON 행 스냅샷, 사진 원본, manifest와 이전 결과를 보관한다. Git과 배포에서 제외한다. 계정 해시와 개인 정보가 포함되므로 외부에 올리지 않는다. `database.dump`는 로컬 복구용이며 관리형 서버에 통째로 덮어쓰지 않는다. 서버 이전은 버전 관리된 migration + 제한된 데이터 가져오기 + Storage API 업로드로 수행했다.

## 다른 PC에서 개발할 때

사이트 이용만 할 때는 위 주소로 접속하면 된다. 로컬 개발도 공용 데이터를 사용할 때:

```powershell
git pull
npm ci
npx supabase login
npm run env:cloud
npm run web
```

`env:cloud`는 공개 키만 CLI로 읽어 `.env.local`과 `.env.cloud.local`에 저장한다. 이전 `.env.local`은 `.local-backups/`에 보존한다. 이후 로컬 개발에서 등록/수정/삭제하면 실제 공용 데이터에 반영된다. `db:migrate`는 기존 로컬 개발 전용 명령이며 공용 서버 변경은 배포 담당자가 대상 ref와 migration 목록을 확인한 뒤 별도로 적용한다. 초기 데이터 이전 스크립트는 이미 데이터가 있는 대상에서 재실행을 거부한다.

## 다시 빌드·배포

`npm run build`는 `.env.cloud.local`의 공개 변수 2개만 사용한다. HTTPS/대상 ref/공개 키를 검증하고 로컬 `.env.local` 자동 로딩을 막는다. `dist`의 서버 키·서버 JWT·로컬 API 주소도 검사한다. 공개 값은 빌드 시 포함되므로 서버 환경 변수만 바꿔서는 배포된 앱 연결이 바뀌지 않는다. 변경 후 재빌드와 Sites 버전 배포가 필요하다.

배포는 Sites source helper로 정확한 소스 commit을 저장·push·package한 다음 owner-private 배포 도구를 사용한다. 원래 GitHub 원격은 그대로 유지한다. `_redirects`는 SPA 경로를 index.html로 연결한다. 실제 배포 결과와 직접 경로 접속은 배포 시 확인한다.

호스팅용 Auth 설정은 `deployment/supabase/config.toml`이다. `supabase/config.toml`은 로컬 개발 전용이므로 원격으로 push하지 않는다. 원격에서는 가입을 제한하고 이메일 로그인을 유지하며 웹/localhost/custom scheme callback을 정확히 지정했다. SMTP/발신 도메인은 이번에 별도 추가하지 않았다. 이메일 재설정·초대 메일은 Supabase 기본 발송 정책의 영향을 받으며 별도 실메일 검증 대상이다. Android/iOS 실제 설치 빌드는 이번 작업 범위에 포함하지 않는다.

근거: [Expo 환경 변수](https://docs.expo.dev/guides/environment-variables/), [Expo 웹 배포](https://docs.expo.dev/guides/publishing-websites/), [Supabase CLI 백업/이전](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [DB 백업과 별도 Storage 파일](https://supabase.com/docs/guides/platform/backups).
