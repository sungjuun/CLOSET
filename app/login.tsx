import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { AuthFeedback, AuthFrame } from '@/features/auth/AuthFrame';
import { SessionStatus } from '@/features/auth/SessionStatus';
import { Captcha } from '@/features/auth/Captcha';
import { useCaptcha } from '@/features/auth/protection';
import { createAuthService } from '@/features/auth/service';
import { useAuthAction } from '@/features/auth/useAuthAction';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { selectionFromParams } from '@/features/color-combinations/finder';

export default function Login() {
  const auth = useAuth();
  const params = useLocalSearchParams();
  const selection = selectionFromParams({ top: params.colorTop, bottom: params.colorBottom });
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const action = useAuthAction();
  const captcha = useCaptcha();
  if (auth.pending || auth.failed) return <SessionStatus />;
  if (auth.userId) return <Redirect href={auth.recoveryRequired ? '/auth/update-password' : selection.top || selection.bottom ? { pathname: '/color-combinations', params: { top: selection.top ?? '', bottom: selection.bottom ?? '' } } : '/wardrobe'} />;
  const submit = () => { void action.run(() => createAuthService(supabase).signIn({ email, password, ...(captcha.token ? { captchaToken: captcha.token } : {}) })).finally(captcha.reset); };
  return <AuthFrame title="로그인" description="내 옷과 코디를 나만의 공간에. 가입한 이메일 계정으로 로그인해 주세요.">
    <FormField label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!action.pending} />
    <FormField label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" editable={!action.pending} onSubmitEditing={submit} />
    <Captcha key={captcha.revision} onToken={captcha.onToken} />
    <AuthFeedback error={action.error} message={action.message} />
    <ActionButton label="로그인" onPress={submit} loading={action.pending} disabled={!supabase || captcha.blocked} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
      <Link href="/forgot-password" style={{ color: colors.primary, paddingVertical: 12 }}>비밀번호 재설정</Link>
      <Link href="/signup" style={{ color: colors.primary, paddingVertical: 12 }}>회원가입 안내</Link>
    </View>
  </AuthFrame>;
}
