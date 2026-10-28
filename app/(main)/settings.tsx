import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WardrobeHeader } from '@/features/wardrobe/components';
import { useSettingsStore } from '@/features/settings/store';
import { themeNames, themes } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { ActionButton } from '@/components/ui/ActionButton';
import { AuthFeedback } from '@/features/auth/AuthFrame';
import { createAuthService } from '@/features/auth/service';
import { useAuthAction } from '@/features/auth/useAuthAction';
import { supabase } from '@/lib/supabase/client';
import { Link } from 'expo-router';

const labels = { white: '화이트', beige: '베이지', brown: '브라운' };

export default function Settings() {
  const colors = useTheme();
  const { theme, setTheme } = useSettingsStore();
  const action = useAuthAction();
  return (
    <View style={{ gap: 24 }}>
      <WardrobeHeader title="내 계정" description="내게 편안한 옷장으로." />
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>화면 테마</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="화면 테마" style={styles.options}>
        {themeNames.map((name) => <Pressable key={name} accessibilityRole="radio" accessibilityState={{ checked: theme === name }} aria-checked={theme === name} accessibilityLabel={`${labels[name]} 테마`} onPress={() => setTheme(name)} style={[styles.option, { borderColor: theme === name ? colors.primary : colors.border, backgroundColor: themes[name].surface }]}><Text style={{ color: themes[name].text }}>{labels[name]}{theme === name ? ' ✓' : ''}</Text></Pressable>)}
      </View>
      <Text style={{ color: colors.muted, lineHeight: 22 }}>현재 선택은 이 실행 중에만 적용됩니다. 기본 언어 한국어 · 기본 통화 KRW</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}><Link href="/brands" style={{ color: colors.primary, paddingVertical: 12 }}>브랜드 관리</Link><Link href="/wardrobe/trash" style={{ color: colors.primary, paddingVertical: 12 }}>휴지통</Link><Link href="/calendar" style={{ color: colors.primary, paddingVertical: 12 }}>착용 기록</Link><Link href="/insights" style={{ color: colors.primary, paddingVertical: 12 }}>통계</Link></View>
      <AuthFeedback error={action.error} message={action.message} />
      <ActionButton label="로그아웃" loading={action.pending} onPress={() => { void action.run(() => createAuthService(supabase).signOut()); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  option: { minHeight: 48, minWidth: 80, borderWidth: 2, borderRadius: 10, padding: 12, justifyContent: 'center', alignItems: 'center' },
});
