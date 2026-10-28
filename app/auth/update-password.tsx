import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { AuthFrame, AuthFeedback } from '@/features/auth/AuthFrame';
import { SessionStatus } from '@/features/auth/SessionStatus';
import { createAuthService } from '@/features/auth/service';
import { useAuthAction } from '@/features/auth/useAuthAction';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';

export default function UpdatePassword() {
  const auth = useAuth();
  const colors = useTheme();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const action = useAuthAction();
  if (auth.pending || auth.failed) return <SessionStatus />;
  if (!auth.userId) return <Redirect href="/login" />;
  const submit = () => { void action.run(async () => {
    await createAuthService(supabase).updatePassword({ password, confirmation });
    auth.finishRecovery();
    router.replace('/wardrobe');
  }); };
  return <AuthFrame title="새 비밀번호" description="이 계정에 사용할 새 비밀번호를 입력해 주세요.">
    <FormField label="새 비밀번호 (8자 이상)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" editable={!action.pending} />
    <FormField label="새 비밀번호 확인" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" editable={!action.pending} onSubmitEditing={submit} />
    <AuthFeedback error={action.error} message={action.message} />
    <ActionButton label="비밀번호 변경" onPress={submit} loading={action.pending} disabled={!supabase} />
    <Pressable accessibilityRole="button" disabled={action.pending} onPress={() => { void action.run(() => createAuthService(supabase).signOut()); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>로그아웃하고 돌아가기</Text></Pressable>
  </AuthFrame>;
}
