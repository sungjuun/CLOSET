import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { AuthFrame, AuthFeedback } from '@/features/auth/AuthFrame';
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
  const action = useAuthAction();
  if (auth.userId && !auth.pending) return <Redirect href="/wardrobe" />;
  const submit = () => { void action.run(() => createAuthService(supabase).signUp({ email, password, confirmation }, authRedirectUrl())); };
  return <AuthFrame title="회원가입" description="계정마다 옷장과 사진을 비공개로 보관합니다.">
    <Text style={{ color: colors.muted, lineHeight: 24 }}>현재 기본 운영은 초대 방식입니다. 신규 가입 허용 여부는 서버에서 관리합니다.</Text>
    <FormField label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!action.pending} />
    <FormField label="비밀번호 (8자 이상)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" editable={!action.pending} />
    <FormField label="비밀번호 확인" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" editable={!action.pending} onSubmitEditing={submit} />
    <AuthFeedback error={action.error} message={action.message} />
    <ActionButton label="가입 요청" onPress={submit} loading={action.pending} disabled={!supabase || auth.pending || auth.failed} />
    <Link href="/login" style={{ color: colors.primary, paddingVertical: 12 }}>로그인으로 돌아가기</Link>
  </AuthFrame>;
}
