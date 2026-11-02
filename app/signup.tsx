import { Link, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { AuthFrame, AuthFeedback } from '@/features/auth/AuthFrame';
import { Captcha } from '@/features/auth/Captcha';
import { useRegistrationAvailability } from '@/features/auth/useRegistrationAvailability';
import { useCaptcha } from '@/features/auth/protection';
import { createAuthService } from '@/features/auth/service';
import { authRedirectUrl } from '@/features/auth/redirect';
import { useAuthAction } from '@/features/auth/useAuthAction';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';

export default function Signup() {
  const auth = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const action = useAuthAction();
  const captcha = useCaptcha();
  const availability = useRegistrationAvailability();
  if (auth.userId && !auth.pending) return <Redirect href="/wardrobe" />;
  const submit = () => {
    if (availability.data !== true || captcha.blocked || action.pending || cooldown > 0) return;
    void action.run(async () => { const result = await createAuthService(supabase).signUp({ email, password, confirmation, ...(captcha.token ? { captchaToken: captcha.token } : {}) }, authRedirectUrl()); setSentTo(email.trim()); setCooldown(60); return result; }).finally(captcha.reset);
  };
  const resend = () => {
    if (!sentTo || cooldown > 0 || captcha.blocked || action.pending || availability.data !== true) return;
    void action.run(async () => { const result = await createAuthService(supabase).resendSignup(sentTo, authRedirectUrl(), captcha.token ?? undefined); setCooldown(60); return result; }).finally(captcha.reset);
  };
  return <AuthFrame title="회원가입" description="계정마다 옷장과 사진을 비공개로 보관합니다.">
    <Text style={{ color: colors.muted, lineHeight: 24 }}>{availability.isPending ? '가입 가능 여부를 확인하고 있어요.' : availability.isError ? '가입 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' : availability.data ? '이메일 인증 후 나만의 옷장을 사용할 수 있어요. 인증 링크는 가입을 요청한 기기와 브라우저에서 열어 주세요.' : '현재 공개 가입을 준비 중입니다. 초대받은 계정은 로그인할 수 있어요.'}</Text>
    <FormField label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!action.pending} />
    <FormField label="비밀번호 (8자 이상)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" editable={!action.pending} />
    <FormField label="비밀번호 확인" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" editable={!action.pending} onSubmitEditing={submit} />
    {availability.isError && <ActionButton label="가입 가능 여부 다시 확인" variant="secondary" onPress={() => { void availability.refetch(); }} />}
    <Captcha key={captcha.revision} onToken={captcha.onToken} />
    <AuthFeedback error={action.error} message={action.message} />
    <ActionButton label="인증 메일 받고 가입하기" onPress={submit} loading={action.pending} disabled={!supabase || availability.data !== true || cooldown > 0 || captcha.blocked || auth.pending || auth.failed} />
    {Boolean(sentTo) && <ActionButton label={cooldown > 0 ? `인증 메일 다시 받기 (${cooldown}초 후)` : '인증 메일 다시 받기'} variant="secondary" disabled={cooldown > 0 || action.pending || captcha.blocked || availability.data !== true} onPress={resend} />}
    <Link href="/login" style={{ color: colors.primary, paddingVertical: 12 }}>로그인으로 돌아가기</Link>
  </AuthFrame>;
}
