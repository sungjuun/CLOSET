import { Text, TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function FormField({ label, error, ...props }: TextInputProps & { label: string; error?: string | undefined }) {
  const colors = useTheme();
  return <View style={{ gap: 8 }}>
    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    <TextInput accessibilityLabel={label} aria-invalid={Boolean(error)} placeholderTextColor={colors.muted} {...props} style={[{ minHeight: 48, minWidth: 0, width: '100%', padding: 12, borderWidth: 1, borderColor: error ? colors.danger : colors.border, borderRadius: 10, color: colors.text, backgroundColor: colors.background, fontSize: 16 }, props.style]} />
    {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text>}
  </View>;
}
