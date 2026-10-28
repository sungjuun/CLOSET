# 인증 모듈

`service.ts`는 이메일 로그인/가입 요청/로그아웃/재설정/PKCE 교환을 담당한다. `schemas.ts`와 `errors.ts`는 검증과 한국어 오류 메시지를 제공한다. AppProviders는 세션 ID와 캐시 경계를 관리하고 `(main)/_layout.tsx`는 인증된 화면만 허용한다. 공개 callback은 세션 전환 때 마운트를 유지한다.

회원가입 허용은 서버 정책이다. 기본 config는 신규 가입을 막고 이메일 공급자를 활성화해 초대 계정 로그인을 허용한다. PKCE 링크는 요청한 기기/브라우저에서 열어야 한다. 실제 RLS/Storage와 Auth API 검증은 `tests/integration/supabase.test.mjs`를 참조한다.
