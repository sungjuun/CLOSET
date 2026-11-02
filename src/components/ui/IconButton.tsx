import { Pressable } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from '@/theme/useTheme';

export function IconButton({ label, icon, disabled, onPress }: {
  label: string; icon: IconName; disabled?: boolean; onPress: () => void;
}) {
  const colors = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: 44, minHeight: 44, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.surface : 'transparent', opacity: disabled ? 0.25 : 1 })}>
    <Icon name={icon} size={18} color={colors.muted} />
  </Pressable>;
}
