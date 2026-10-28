import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';
import { credentialsSchema, emailSchema, newPasswordSchema } from './schemas';

export function createAuthService(client: SupabaseClient<Database> | null) {
  const backend = () => {
    if (!client) throw { code: 'backend_missing' };
    return client;
  };
  return {
    async signIn(input: { email: string; password: string }) {
      const credentials = credentialsSchema.parse(input);
      const { error } = await backend().auth.signInWithPassword(credentials);
      if (error) throw error;
    },
    async signUp(input: { email: string; password: string; confirmation: string }, redirectTo: string) {
      const credentials = credentialsSchema.parse(input);
      newPasswordSchema.parse(input);
      const { data, error } = await backend().auth.signUp({ ...credentials, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      return data.session ? '로그인했습니다.' : '인증 이메일을 보냈습니다. 이메일의 링크를 열어 가입을 완료해 주세요.';
    },
    async signOut() {
      const { error } = await backend().auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
    async requestReset(email: string, redirectTo: string) {
      const { error } = await backend().auth.resetPasswordForEmail(emailSchema.parse(email.trim()), { redirectTo });
      if (error) throw error;
      // Do not reveal whether the address belongs to a registered account.
      return '등록된 계정이 있다면 재설정 이메일을 보냈습니다. 요청한 기기와 브라우저에서 링크를 열어 주세요.';
    },
    async completeCallback(code: string) {
      const auth = backend().auth;
      let recovery = false;
      const { data: listener } = auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') recovery = true; });
      try {
        const { error } = await auth.exchangeCodeForSession(code);
        if (error) throw error;
        return recovery;
      } finally {
        listener.subscription.unsubscribe();
      }
    },
    async updatePassword(input: { password: string; confirmation: string }) {
      const value = newPasswordSchema.parse(input);
      const { data, error: sessionError } = await backend().auth.getSession();
      if (sessionError || !data.session) throw { code: 'session_missing' };
      const { error } = await backend().auth.updateUser({ password: value.password });
      if (error) throw error;
    },
  };
}
