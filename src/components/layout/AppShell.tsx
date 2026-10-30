import { usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GuardedLink as Link } from '@/providers/NavigationGuard';
import { useAuth } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { Icon } from '@/components/ui/Icon';
import { desktopRoutes, mobileRoutes, isNavigationActive } from './navigation';
import { useAccountPreferences } from '@/features/settings/AccountPreferencesProvider';
import { HeaderWeather } from '@/features/weather/HeaderWeather';

function Navigation({ desktop }: { desktop: boolean }) {
  const colors = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  return <View accessibilityRole="tablist" style={[styles.navigation, { gap: desktop ? 16 : 0, paddingHorizontal: desktop ? 0 : 4 }]}>
    {(desktop ? desktopRoutes : mobileRoutes).map((route) => {
      const active = isNavigationActive(route.href, pathname);
      return <Link key={route.href} href={route.href === '/settings' ? { pathname: '/settings', params: { section: 'general' } } : route.href} asChild><Pressable accessibilityRole="tab" accessibilityLabel={route.label} accessibilityState={{ selected: active }} aria-selected={active} style={{ flex: desktop ? undefined : 1, minHeight: desktop ? 78 : 52, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 2.5, borderBottomColor: active ? colors.primary : 'transparent' }}>
        {desktop && <Icon name={route.icon} size={15} color={active ? colors.text : colors.muted} />}
        <Text style={{ color: active ? colors.text : colors.muted, fontSize: desktop ? 13 : width < 360 ? 11 : 12, fontWeight: active ? '800' : '600', letterSpacing: -0.3 }}>{route.label}</Text>
      </Pressable></Link>;
    })}
  </View>;
}

export function AppShell({ children }: PropsWithChildren) {
  const colors = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const desktop = width >= 1200;
  const auth = useAuth();
  const { profile } = useAccountPreferences();
  const authenticated = Boolean(auth.userId) && !auth.pending && !auth.failed;
  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={{ borderBottomColor: colors.border, borderBottomWidth: 1 }}>
      <HeaderWeather owner={authenticated ? auth.userId : null} compact={!desktop} renderHeader={(weatherControl) => <View style={[styles.header, { paddingHorizontal: desktop ? 28 : 16, minHeight: desktop ? 78 : 88 }]}>
        <Link href="/wardrobe" accessibilityLabel="CLOSET 홈" asChild><Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 }}>
          <View style={{ width: desktop ? 31 : 30, height: desktop ? 31 : 30, borderRadius: 9, backgroundColor: colors.brand, padding: 5 }}><Icon name="hanger" size={desktop ? 21 : 20} color="#FFFFFF" /></View>
          <Text style={{ color: colors.text, fontSize: desktop ? 27 : 25, fontWeight: '900', letterSpacing: -1.4 }}>CLOSET<Text style={{ color: colors.primary }}>.</Text></Text>
        </Pressable></Link>
        {desktop && authenticated && <Navigation desktop />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: desktop ? 18 : 4 }}>
          {desktop && authenticated && <Link href={{ pathname: '/settings', params: { section: 'account' } }} asChild><Pressable accessibilityRole="link" accessibilityLabel="내 계정" style={{ alignItems: 'center', gap: 4, paddingVertical: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 29, height: 29, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={17} color={colors.muted} /></View><Text numberOfLines={1} style={{ maxWidth: 110, color: colors.text, fontSize: 11, fontWeight: '700', letterSpacing: profile?.display_name ? 0 : 1.3 }}>{profile?.display_name || 'MY CLOSET'}</Text></View>
            <Text style={{ color: colors.muted, fontSize: 10 }}>내 계정 ↗</Text>
          </Pressable></Link>}
          {!authenticated && desktop && <Link href="/login" style={{ color: colors.primary, paddingVertical: 12, fontSize: 12 }}>로그인</Link>}
          {weatherControl}
        </View>
      </View>} />
      {!desktop && authenticated && <Navigation desktop={false} />}
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
