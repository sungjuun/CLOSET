import type { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase/client';

export function AuthFrame({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  const colors = useTheme();
  return <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: 24, paddingVertical: 24 }}>
    <Text style={{ color: colors.primary, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' }}>YOUR PRIVATE WARDROBE</Text>
    <View style={{ gap: 12 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 15, lineHeight: 24 }}>{description}</Text></View>
    {!supabase && <Text accessibilityRole="alert" style={{ color: colors.muted, lineHeight: 24 }}>서비스 연결이 준비되지 않았습니다. 연결 설정을 확인한 후 다시 시도해 주세요.</Text>}
    {children}
  </View>;
}

export function AuthFeedback({ error, message }: { error: string | null; message: string | null }) {
  const colors = useTheme();
  return <>{error && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 24 }}>{error}</Text>}{message && <Text accessibilityLiveRegion="polite" style={{ color: colors.text, lineHeight: 24 }}>{message}</Text>}</>;
}
