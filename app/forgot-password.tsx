import { Link } from 'expo-router';
import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { AuthFrame, AuthFeedback } from '@/features/auth/AuthFrame';
import { Captcha } from '@/features/auth/Captcha';
import { useCaptcha } from '@/features/auth/protection';
import { createAuthService } from '@/features/auth/service';
import { authRedirectUrl } from '@/features/auth/redirect';
import { useAuthAction } from '@/features/auth/useAuthAction';
import { supabase } from '@/lib/supabase/client';
import { useTheme } from '@/theme/useTheme';

export default function ForgotPassword() {
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const action = useAuthAction();
  const captcha = useCaptcha();
  const submit = () => { void action.run(() => createAuthService(supabase).requestReset(email, authRedirectUrl(), captcha.token ?? undefined)).finally(captcha.reset); };
  return <AuthFrame title="비밀번호 재설정" description="가입한 이메일로 재설정 링크를 보내드립니다.">
    <FormField label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!action.pending} onSubmitEditing={submit} />
    <Captcha key={captcha.revision} onToken={captcha.onToken} />
    <AuthFeedback error={action.error} message={action.message} />
    <ActionButton label="재설정 이메일 보내기" onPress={submit} loading={action.pending} disabled={!supabase || captcha.blocked} />
    <Link href="/login" style={{ color: colors.primary, paddingVertical: 12 }}>로그인으로 돌아가기</Link>
  </AuthFrame>;
}
