import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';

export const categoryIcons: Record<string, IconName> = {
  outerwear: 'coat', tops: 'shirt', bottoms: 'trousers', onepiece: 'dress', shoes: 'shoe', bags: 'bag', accessories: 'watch',
};

export function CategoryToggle({ name, active, disabled, onChange }: {
  name: string; active: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  const colors = useTheme();
  return <Pressable accessibilityRole="switch" accessibilityLabel={`${name} 사용`} accessibilityState={{ checked: active, disabled }} aria-checked={active} disabled={disabled} onPress={() => onChange(!active)}
    style={{ minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
    <View style={{ width: 42, height: 24, padding: 3, borderRadius: 14, backgroundColor: active ? colors.primary : colors.muted, alignItems: active ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: 18, height: 18, borderRadius: 10, backgroundColor: colors.onPrimary }} />
    </View>
  </Pressable>;
}

export function CategoryIconButton({ label, icon, disabled, onPress }: {
  label: string; icon: IconName; disabled?: boolean; onPress: () => void;
}) {
  const colors = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: 44, minHeight: 44, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.surface : 'transparent', opacity: disabled ? 0.25 : 1 })}>
    <Icon name={icon} size={18} color={colors.muted} />
  </Pressable>;
}

export function CategoryMoveButtons({ name, first, last, disabled, onMove }: {
  name: string; first: boolean; last: boolean; disabled: boolean; onMove: (direction: -1 | 1) => void;
}) {
  return <View style={{ flexDirection: 'row' }}>
    <CategoryIconButton label={`${name} 위로`} icon="up" disabled={disabled || first} onPress={() => onMove(-1)} />
    <CategoryIconButton label={`${name} 아래로`} icon="down" disabled={disabled || last} onPress={() => onMove(1)} />
  </View>;
}
