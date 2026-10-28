import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useTheme } from '@/theme/useTheme';

type Props = { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'secondary' };
export function ActionButton({ label, onPress, loading = false, disabled = false, variant = 'primary' }: Props) {
  const colors = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} aria-disabled={disabled || loading} aria-busy={loading} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 48, borderRadius: 10, padding: 14, backgroundColor: variant === 'primary' ? colors.primary : colors.background, borderColor: colors.border, borderWidth: variant === 'secondary' ? 1 : 0, opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1, alignItems: 'center', justifyContent: 'center' })}>
    {loading ? <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} accessibilityLabel="처리 중" /> : <Text style={{ color: variant === 'primary' ? colors.onPrimary : colors.text, fontWeight: '700', fontSize: 15 }}>{label}</Text>}
  </Pressable>;
}
