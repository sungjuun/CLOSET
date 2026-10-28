import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { ActionButton } from '@/components/ui/ActionButton';

export function WardrobeHeader({ title, description }: { title: string; description: string }) {
  const colors = useTheme();
  return <View style={{ gap: 7 }}><Text style={{ color: colors.muted, fontWeight: '700', fontSize: 11, letterSpacing: 1.4 }}>MY PERSONAL WARDROBE</Text><Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '800', fontSize: 29, lineHeight: 38, letterSpacing: -1.1 }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 22 }}>{description}</Text></View>;
}

export function WardrobeState({ title, message, retry }: { title: string; message: string; retry?: (() => void) | undefined }) {
  const colors = useTheme();
  return <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 24, gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>{title}</Text><Text accessibilityLiveRegion="polite" style={{ color: colors.muted, lineHeight: 24 }}>{message}</Text>
    {retry && <ActionButton variant="secondary" label="다시 시도" onPress={retry} />}
  </View>;
}

export function PhotoPlaceholder({ aspectRatio = 1 }: { aspectRatio?: number }) {
  const colors = useTheme();
  return <View accessibilityLabel="사진 미등록" style={{ width: '100%', aspectRatio, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 8 }}><Text style={{ color: colors.muted, fontSize: 12 }}>사진 미등록</Text></View>;
}

export function Choice({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const colors = useTheme();
  return <Pressable accessibilityRole="button" aria-pressed={selected} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, minWidth: 44, maxWidth: '100%', paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.surface : colors.background, justifyContent: 'center' }}><Text style={{ color: selected ? colors.primary : colors.text }}>{label}</Text></Pressable>;
}

export function WardrobeBackLink() {
  const colors = useTheme();
  return <Link href="/wardrobe" style={{ color: colors.primary, paddingVertical: 12, alignSelf: 'flex-start' }}>← 내 옷장</Link>;
}
