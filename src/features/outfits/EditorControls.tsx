import { ActivityIndicator, Pressable, Text, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';

type Props = { label: string; onPress: () => void; icon?: IconName; iconOnly?: boolean; disabled?: boolean; loading?: boolean; selected?: boolean; expanded?: boolean; variant?: 'primary' | 'secondary' | 'quiet'; style?: ViewStyle };

export function OutfitControl({ label, onPress, icon, iconOnly = false, disabled = false, loading = false, selected, expanded, variant = 'secondary', style }: Props) {
  const colors = useTheme();
  const blocked = disabled || loading;
  const ink = variant === 'primary' ? colors.onPrimary : selected ? colors.primary : variant === 'quiet' ? colors.muted : colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: blocked, busy: loading, ...(selected === undefined ? {} : { selected }), ...(expanded === undefined ? {} : { expanded }) }} aria-pressed={selected} aria-expanded={expanded} disabled={blocked} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, minWidth: 44, maxWidth: '100%', paddingHorizontal: iconOnly ? 10 : 12, paddingVertical: 8, borderRadius: 8, borderWidth: variant === 'quiet' ? 0 : 1, borderColor: selected ? colors.primary : variant === 'primary' ? colors.primary : colors.border, backgroundColor: variant === 'primary' ? colors.primary : selected ? colors.surface : variant === 'quiet' ? 'transparent' : colors.background, opacity: blocked ? 0.5 : pressed ? 0.75 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, ...style })}>
    {loading ? <ActivityIndicator accessibilityLabel="처리 중" color={ink} /> : <>{icon && <Icon name={icon} size={16} color={ink} />}{!iconOnly && <Text numberOfLines={1} style={{ color: ink, fontSize: 13, fontWeight: variant === 'primary' ? '700' : '500', flexShrink: 1 }}>{label}</Text>}</>}
  </Pressable>;
}
