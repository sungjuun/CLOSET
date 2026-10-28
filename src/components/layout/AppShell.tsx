import { usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GuardedLink as Link } from '@/providers/NavigationGuard';
import { useAuth } from '@/providers/AppProviders';
import { useSettingsStore } from '@/features/settings/store';
import { themeNames } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Icon, type IconName } from '@/components/ui/Icon';

const routes: { href: '/announcements' | '/wardrobe' | '/brands' | '/outfits' | '/outfits/new' | '/recommendations' | '/memos'; label: string; icon: IconName }[] = [
  { href: '/announcements', label: '공지', icon: 'bell' },
  { href: '/wardrobe', label: '내 옷장', icon: 'shirt' },
  { href: '/brands', label: '브랜드', icon: 'bookmark' },
  { href: '/outfits', label: '저장한 코디', icon: 'bookmark' },
  { href: '/outfits/new', label: '코디 만들기', icon: 'layers' },
  { href: '/recommendations', label: '코디 추천', icon: 'sparkles' },
  { href: '/memos', label: '메모', icon: 'memo' },
];
const swatches = { white: '#FFFFFF', beige: '#D8BD94', brown: '#8E6B55' };
const labels = { white: '화이트', beige: '베이지', brown: '브라운' };

function ThemeSwitches() {
  const colors = useTheme();
  const { theme, setTheme } = useSettingsStore();
  return <View accessibilityRole="radiogroup" accessibilityLabel="화면 테마" style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
    {themeNames.map((name) => <Pressable key={name} accessibilityRole="radio" accessibilityLabel={`${labels[name]} 테마`} accessibilityState={{ checked: theme === name }} aria-checked={theme === name} onPress={() => setTheme(name)} style={({ pressed }) => ({ width: 38, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
      <View style={{ width: 33, height: 33, borderRadius: 18, padding: 3, borderWidth: theme === name ? 1.8 : 0, borderColor: colors.primary }}><View style={{ flex: 1, borderRadius: 20, borderWidth: 1, borderColor: name === 'white' ? '#DDDEE4' : '#C6AC94', backgroundColor: swatches[name] }} /></View>
    </Pressable>)}
  </View>;
}

function Navigation({ desktop }: { desktop: boolean }) {
  const colors = useTheme();
  const pathname = usePathname();
  return <View accessibilityRole="tablist" style={[styles.navigation, { gap: desktop ? 22 : 25, paddingHorizontal: desktop ? 0 : 16 }]}>
    {routes.map((route) => {
      const active = route.href === '/outfits' ? pathname === '/outfits' : pathname === route.href || pathname.startsWith(`${route.href}/`);
      return <Link key={route.href} href={route.href} asChild><Pressable accessibilityRole="tab" accessibilityLabel={route.label} accessibilityState={{ selected: active }} aria-selected={active} style={{ minHeight: desktop ? 78 : 52, flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 2.5, borderBottomColor: active ? colors.primary : 'transparent' }}>
        {desktop && <Icon name={route.icon} size={15} color={active ? colors.text : colors.muted} />}
        <Text style={{ color: active ? colors.text : colors.muted, fontSize: 13, fontWeight: active ? '800' : '600', letterSpacing: -0.3 }}>{route.label}</Text>
      </Pressable></Link>;
    })}
    {!desktop && <Link href="/settings" style={{ paddingVertical: 17, color: colors.muted, fontSize: 13, fontWeight: '600' }}>내 계정</Link>}
  </View>;
}

export function AppShell({ children }: PropsWithChildren) {
  const colors = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const desktop = width >= 1100;
  const auth = useAuth();
  const authenticated = Boolean(auth.userId) && !auth.pending && !auth.failed;
  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={{ borderBottomColor: colors.border, borderBottomWidth: 1 }}>
      <View style={[styles.header, { paddingHorizontal: desktop ? 28 : 16, minHeight: desktop ? 78 : 88 }]}>
        <Link href="/wardrobe" accessibilityLabel="CLOSET 홈" asChild><Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 }}>
          <View style={{ width: desktop ? 31 : 30, height: desktop ? 31 : 30, borderRadius: 9, backgroundColor: colors.primary, padding: 5 }}><Icon name="hanger" size={desktop ? 21 : 20} color="#FFFFFF" /></View>
          <Text style={{ color: colors.text, fontSize: desktop ? 27 : 25, fontWeight: '900', letterSpacing: -1.4 }}>CLOSET<Text style={{ color: colors.primary }}>.</Text></Text>
        </Pressable></Link>
        {desktop && authenticated && <Navigation desktop />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: desktop ? 18 : 4 }}>
          {desktop && authenticated && <Link href="/settings" asChild><Pressable accessibilityRole="link" accessibilityLabel="내 계정" style={{ alignItems: 'center', gap: 4, paddingVertical: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 29, height: 29, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={17} color={colors.muted} /></View><Text style={{ color: colors.text, fontSize: 11, fontWeight: '700', letterSpacing: 1.3 }}>MY CLOSET</Text></View>
            <Text style={{ color: colors.muted, fontSize: 10 }}>내 계정 ↗</Text>
          </Pressable></Link>}
          {!authenticated && desktop && <Link href="/login" style={{ color: colors.primary, paddingVertical: 12, fontSize: 12 }}>로그인</Link>}
          <ThemeSwitches />
        </View>
      </View>
      {!desktop && authenticated && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}><Navigation desktop={false} /></ScrollView>}
    </View>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingTop: desktop ? 34 : 28, paddingHorizontal: width >= 1100 ? pathname === '/outfits' ? 20 : 48 : width >= 768 ? 28 : 16, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 1440, alignSelf: 'center' }}>{children}</View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  navigation: { flexDirection: 'row', alignItems: 'center' },
});
