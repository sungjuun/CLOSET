import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { AuthFrame } from '@/features/auth/AuthFrame';
import { createAuthService } from '@/features/auth/service';
import { callbackCode } from '@/features/auth/schemas';
import { supabase } from '@/lib/supabase/client';
import { useTheme } from '@/theme/useTheme';

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string | string[]; error?: string | string[] }>();
  const { code, error } = params;
  const router = useRouter();
  const colors = useTheme();
  const operation = useRef<Promise<boolean> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    // Reuse the same exchange during React StrictMode's effect replay.
    operation.current ??= Promise.resolve().then(() => createAuthService(supabase).completeCallback(callbackCode({ code, error })));
    void operation.current.then((recovery) => {
      if (mounted) router.replace(recovery ? '/auth/update-password' : '/wardrobe');
    }).catch(() => { if (mounted) { setFailed(true); router.setParams({ code: undefined, error: undefined }); } });
    return () => { mounted = false; };
  }, [code, error, router]);
  return <AuthFrame title="이메일 인증" description={failed ? '링크가 만료됐거나 이 기기에 인증 요청 정보가 없습니다. 요청한 기기와 브라우저에서 새 링크를 열어 주세요.' : '인증 정보를 확인하고 있습니다…'}>
    {failed && <><Text accessibilityRole="alert" style={{ color: colors.muted }}>인증을 완료하지 못했습니다.</Text><Link href="/forgot-password" style={{ color: colors.primary, paddingVertical: 12 }}>새 재설정 링크 요청</Link><Link href="/login" style={{ color: colors.primary, paddingVertical: 12 }}>로그인으로 돌아가기</Link></>}
  </AuthFrame>;
}
