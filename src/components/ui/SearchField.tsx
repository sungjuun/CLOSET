import { TextInput, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { Icon } from './Icon';

export function SearchField({ label, placeholder, value, onChange, onSubmit }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; onSubmit?: () => void }) {
  const colors = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 7, paddingHorizontal: 13, gap: 10, minHeight: 42 }}>
    <Icon name="search" size={18} color={colors.muted} />
    <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.muted} value={value} onChangeText={onChange} onSubmitEditing={onSubmit} returnKeyType="search" autoCorrect={false} maxLength={200} style={{ flex: 1, minWidth: 0, minHeight: 42, fontSize: 14, color: colors.text, paddingVertical: 8 }} />
  </View>;
}
