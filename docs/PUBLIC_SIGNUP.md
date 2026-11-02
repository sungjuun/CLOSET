# 공개 회원가입 준비

기준일: 2026-11-03. 앱·서버 코드 준비와 실제 서비스 연결을 구분합니다.

## 현재 상태

| 항목 | 상태 |
| --- | --- |
| 공개 회원가입 | 닫힘 |
| 사이트 접속 범위 | 소유자 전용 |
| 이메일 로그인·인증 | 활성 |
| SMTP | 외부 서비스·발신자 연결 대기 |
| CAPTCHA | 웹/네이티브 연결 코드 준비, 실제 Turnstile 키·서버 활성화 대기 |
| 회원별 한도 | 운영 DB 적용. 의류 300개, 이미지 합계 100MiB·500개 |
| 인증 URL | 현재 운영 사이트와 callback 일치 |

사용자는 아직 SMTP/Cloudflare 계정과 자체 도메인이 없다고 답했습니다. 계정 가입·약관 동의·새 인증정보 입력은 직접 진행하며 비밀 값을 채팅이나 Git에 넣지 않습니다. 유료 가입이나 도메인 구매는 이번 작업에서 하지 않았습니다.

## 메일 연결

1. [Brevo](https://app.brevo.com/) 등 SMTP 서비스에 계정을 만들고 이메일 인증·서비스 이용 가능 상태를 확인합니다.
2. 발신자 이름을 CLOSET으로 정하고 본인이 사용하는 메일 주소를 등록·검증합니다. 도메인이 없는 경우 제공자의 발신자 정책·발신 주소 변경 여부와 실제 수신 결과를 확인합니다.
3. SMTP 연결 값을 발급하고 Supabase의 Auth 이메일 SMTP 설정에 직접 입력합니다.

Brevo 사용 시 공식 SMTP host는 `smtp-relay.brevo.com`, 기본 권장 포트는 587입니다. 사용자명은 서비스 화면의 SMTP 로그인 값이며 비밀번호는 **SMTP 키**입니다. API 키와 구분합니다. 발신 주소에는 검증된 주소를 사용합니다.

- [Brevo SMTP 안내](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
- [Supabase SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp)

Supabase 기본 발송은 외부 수신자가 제한되므로 실제 외부 가입 메일 수신을 확인해야 합니다. 인증을 끄는 방식으로 우회하지 않습니다.

## Turnstile 연결

1. [Cloudflare](https://dash.cloudflare.com/)에 가입·로그인하고 Turnstile 위젯을 만듭니다.
2. 허용 hostname은 `closet.itsmesungjun.chatgpt.site`, 위젯은 Managed 모드로 준비합니다.
3. **공개 사이트 키**를 `.env.cloud.local`의 `EXPO_PUBLIC_TURNSTILE_SITE_KEY`에 넣습니다. `EXPO_PUBLIC_WEB_ORIGIN`은 운영 HTTPS origin이어야 합니다.
4. **시크릿 키**는 Supabase Auth Bot/Abuse Protection에 직접 넣고 provider를 Turnstile로 설정합니다. 클라이언트 파일에는 넣지 않습니다.

가입·로그인·비밀번호 재설정·가입 메일 재요청이 토큰을 전달하고, 요청 후 토큰을 비우며, 만료/오류 때 다시 확인합니다. 네이티브는 같은 origin의 `/auth/challenge` WebView를 사용합니다. 실제 보호를 켜기 전에 프런트 키와 서버 설정을 함께 준비하여 기존 로그인을 막지 않도록 합니다.

- [Supabase CAPTCHA 안내](https://supabase.com/docs/guides/auth/auth-captcha)
- [Cloudflare 위젯 안내](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)

## 공개 전환 완료 기준

- 외부 SMTP 연결과 실제 가입·재설정 메일 수신 확인.
- 실제 Turnstile의 성공·실패·만료와 기존 계정 로그인 확인.
- 이메일 인증을 유지한 채 서버 가입 허용·사이트 접근 범위를 전환.
- 소유자와 다른 새 회원으로 가입→인증→로그인→빈 옷장→첫 등록 확인.
- 타 회원의 옷·사진·코디 접근 차단과 사용량 한도 확인.
- `node scripts/check-public-registration.mjs --require-open` 통과.

준비 상태 검사 스크립트는 읽기 전용이며 가입/SMTP/CAPTCHA/공유 범위를 변경하지 않습니다. 검사 통과는 실제 수신자와 실기기 검증의 대체가 아닙니다.

## 회원별 사용량

휴지통을 포함한 의류 수와 세 private 버킷의 실제 이미지 수·크기를 합산합니다. 직접 등록/백업 복원/동시 요청도 서버에서 검증합니다. 업로드 전에 본인 경로의 용량을 확인하며 실제 파일 쓰기에는 restrictive RLS가 다시 적용됩니다. 이미 저장된 같은 경로의 재시도와 기존 의류 수정은 유지합니다.

설정 → 계정·보안 → 내 사용량에서 집계를 볼 수 있습니다. 관리자 한도 테이블은 일반 회원이 수정하거나 백업으로 덮어쓸 수 없습니다. 기존 자료를 삭제하여 한도에 맞추는 작업은 하지 않습니다.
