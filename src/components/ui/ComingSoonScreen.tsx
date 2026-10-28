import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { WardrobeHeader } from '@/features/wardrobe/components';
import { Icon, type IconName } from './Icon';

export function ComingSoonScreen({ title, description, icon, message }: { title: string; description: string; icon: IconName; message: string }) {
  const colors = useTheme();
  return <View style={{ gap: 32 }}><WardrobeHeader title={title} description={description} /><View style={{ paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, gap: 16 }}><Icon name={icon} size={32} color={colors.muted} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{message}</Text><Link href="/wardrobe" style={{ color: colors.primary, fontSize: 13, paddingVertical: 14 }}>내 옷장으로 돌아가기 →</Link></View></View>;
}
