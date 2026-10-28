import { z } from 'zod';

export const emailSchema = z.email('이메일 주소를 확인해 주세요.').max(254).transform((value) => value.trim());
export const credentialsSchema = z.object({
  email: z.string().trim().pipe(emailSchema),
  password: z.string().min(8, '비밀번호는 8자 이상 입력해 주세요.').max(128, '비밀번호는 128자 이하로 입력해 주세요.'),
});
export const newPasswordSchema = credentialsSchema.pick({ password: true }).extend({
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation, { message: '비밀번호가 일치하지 않습니다.', path: ['confirmation'] });

export function callbackCode(params: { code?: string | string[] | undefined; error?: string | string[] | undefined }) {
  if (params.error || typeof params.code !== 'string' || !params.code || params.code.length > 4096) {
    throw new Error('INVALID_AUTH_LINK');
  }
  return params.code;
}
