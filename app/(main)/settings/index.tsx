import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GuardedLink as Link } from '@/providers/NavigationGuard';
import { WardrobeHeader } from '@/features/wardrobe/components';
import { useSettingsStore } from '@/features/settings/store';
import { useThemePreferences } from '@/features/settings/ThemePreferencesProvider';
import { themeNames, themes } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ActionButton } from '@/components/ui/ActionButton';
import { AuthFeedback } from '@/features/auth/AuthFrame';
import { createAuthService } from '@/features/auth/service';
import { useAuthAction } from '@/features/auth/useAuthAction';
import { supabase } from '@/lib/supabase/client';

const labels = { white: '화이트', beige: '베이지', brown: '브라운' };

function ManagementLink({ href, title, description, icon }: {
  href: '/settings/brands' | '/settings/categories'; title: string; description: string; icon: IconName;
}) {
  const colors = useTheme();
  return <Link href={href} asChild><Pressable accessibilityRole="link" style={({ pressed }) => ({ flexBasis: 280, flexGrow: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surface : colors.background })}>
    <View style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 10 }}><Icon name={icon} color={colors.primary} size={22} /></View>
    <View style={{ flex: 1, gap: 6 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{description}</Text></View>
    <Icon name="arrow" size={18} color={colors.muted} />
  </Pressable></Link>;
}

export default function Settings() {
  const colors = useTheme();
  const { theme, status, error } = useSettingsStore();
  const preferences = useThemePreferences();
  const themeDisabled = status !== 'ready';
  const action = useAuthAction();
  const section = { gap: 16, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 12 } as const;
  return <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center', gap: 28 }}>
    <WardrobeHeader title="설정" description="옷장 관리와 화면, 계정 설정을 한곳에서." />
    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>옷장 관리</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <ManagementLink href="/settings/brands" title="브랜드 관리" description="브랜드명과 이미지를 등록하고 수정하세요." icon="bookmark" />
        <ManagementLink href="/settings/categories" title="카테고리 관리" description="옷 종류와 세부 분류, 순서와 사용 여부를 관리하세요." icon="shirt" />
      </View>
    </View>
    <View style={section}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>화면 테마</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="화면 테마" style={styles.options}>
        {themeNames.map((name) => <Pressable key={name} accessibilityRole="radio" disabled={themeDisabled} accessibilityState={{ checked: theme === name, disabled: themeDisabled }} aria-checked={theme === name} accessibilityLabel={`${labels[name]} 테마`} onPress={() => preferences.select(name)} style={[styles.option, { borderColor: theme === name ? colors.primary : colors.border, backgroundColor: themes[name].surface, opacity: themeDisabled ? 0.6 : 1 }]}><Text style={{ color: themes[name].text }}>{labels[name]}{theme === name ? ' ✓' : ''}</Text></Pressable>)}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13, lineHeight: 22 }}>{error ?? (status === 'saving' ? '테마를 저장하는 중이에요…' : status === 'loading' ? '저장된 테마를 불러오는 중이에요…' : '테마는 계정에 자동 저장되며 다음 로그인에도 유지됩니다.')}</Text>
      {error && <ActionButton variant="secondary" label="테마 다시 불러오기" onPress={preferences.reload} />}
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 22 }}>기본 언어 한국어 · 가격 단위 원(₩)</Text>
    </View>
    <View style={section}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>기록과 정리</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}><Link href="/calendar" style={{ color: colors.primary, paddingVertical: 12 }}>착용 기록</Link><Link href="/insights" style={{ color: colors.primary, paddingVertical: 12 }}>통계</Link><Link href="/wardrobe/trash" style={{ color: colors.primary, paddingVertical: 12 }}>휴지통</Link></View>
    </View>
    <View style={section}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>내 계정</Text>
      <AuthFeedback error={action.error} message={action.message} />
      <ActionButton variant="secondary" label="로그아웃" loading={action.pending} onPress={() => { void action.run(() => createAuthService(supabase).signOut()); }} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  option: { minHeight: 48, minWidth: 80, borderWidth: 2, borderRadius: 10, padding: 12, justifyContent: 'center', alignItems: 'center' },
});
