import { Pressable, Text, View } from 'react-native';
import { moreRoutes } from '@/components/layout/navigation';
import { Icon } from '@/components/ui/Icon';
import { GuardedLink as Link } from '@/providers/NavigationGuard';
import { useTheme } from '@/theme/useTheme';

const descriptions: Record<string, string> = { '/color-combinations': '상의와 하의의 색상 조합을 찾아보세요.', '/style-guide': '코디·핏·소재·관리 팁을 모았어요.', '/settings': '계정과 화면, 옷장 분류를 관리하세요.' };
export default function MoreScreen() {
  const colors = useTheme();
  return <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center', gap: 24 }}><Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '900', color: colors.text }}>더보기</Text><Text style={{ color: colors.muted, fontSize: 14 }}>내 옷장을 더 편리하게 활용해 보세요.</Text><View style={{ gap: 12 }}>{moreRoutes.map(route => <Link key={route.href} href={route.href === '/settings' ? { pathname: '/settings', params: { section: 'general' } } : route.href} asChild><Pressable accessibilityRole="link" accessibilityLabel={route.label} style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}><View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.surface }}><Icon name={route.icon} color={colors.primary} size={22} /></View><View style={{ flex: 1, gap: 7 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{route.label}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>{descriptions[route.href]}</Text></View><Icon name="arrow" size={17} color={colors.muted} /></Pressable></Link>)}</View></View>;
}
