import type { PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { colorOf, describePair, type ColorPair } from './finder';

export function FinderControl({ label, onPress, icon, selected = false, disabled = false, primary = false }: { label: string; onPress: () => void; icon?: IconName; selected?: boolean; disabled?: boolean; primary?: boolean }) {
  const colors = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(icon === 'heart' ? { selected } : {}) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 14, borderRadius: primary ? 24 : 7, borderWidth: 1, borderColor: primary || selected ? colors.primary : colors.border, backgroundColor: primary ? colors.primary : selected ? colors.surface : colors.background, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
    {icon && <Icon name={icon} size={15} color={primary ? colors.onPrimary : selected ? colors.primary : colors.muted} filled={icon === 'heart' && selected} />}
    <Text style={{ color: primary ? colors.onPrimary : selected ? colors.primary : colors.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
  </Pressable>;
}
export function FinderBadge({ children }: PropsWithChildren) {
  const colors = useTheme(); return <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{children}</Text></View>;
}
export function PairSummary({ pair, onApply, onRemove }: { pair: ColorPair; onApply: () => void; onRemove?: () => void }) {
  const colors = useTheme(); const description = describePair(pair);
  return <View style={{ flex: 1, minWidth: 0, gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.background }}>
    <View aria-hidden style={{ height: 48, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 7, overflow: 'hidden' }}><View style={{ flex: 1, backgroundColor: colorOf(pair.top).hex }} /><View style={{ flex: 1, backgroundColor: colorOf(pair.bottom).hex }} /></View>
    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{description.title}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>{description.top.label} 상의 + {description.bottom.label} 하의</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><FinderControl label="조합 불러오기" onPress={onApply} />{onRemove && <FinderControl label="비교에서 제거" onPress={onRemove} icon="close" />}</View>
  </View>;
}
