import { z } from 'zod';

export function authErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? '입력값을 확인해 주세요.';
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    invalid_credentials: '이메일 또는 비밀번호를 확인해 주세요.',
    email_not_confirmed: '이메일 인증을 완료한 뒤 로그인해 주세요.',
    signup_disabled: '현재는 초대받은 계정만 이용할 수 있습니다.',
    email_provider_disabled: '이메일 로그인이 설정되지 않았습니다. 서비스 설정을 확인해 주세요.',
    over_request_rate_limit: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    over_email_send_rate_limit: '이메일 발송이 제한됐습니다. 잠시 후 다시 시도해 주세요.',
    weak_password: '더 안전한 비밀번호를 입력해 주세요.',
    same_password: '기존 비밀번호와 다른 비밀번호를 입력해 주세요.',
    bad_code_verifier: '링크를 요청한 기기와 브라우저에서 다시 열어 주세요.',
    flow_state_not_found: '인증 링크가 만료됐습니다. 새 링크를 요청해 주세요.',
    flow_state_expired: '인증 링크가 만료됐습니다. 새 링크를 요청해 주세요.',
    otp_expired: '인증 링크가 만료됐습니다. 새 링크를 요청해 주세요.',
    backend_missing: 'Supabase 연결 설정이 필요합니다. 개발 환경 설정을 확인해 주세요.',
    session_missing: '로그인이 필요합니다. 새 인증 링크를 요청해 주세요.',
  };
  return messages[code] ?? '요청을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
