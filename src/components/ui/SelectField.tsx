import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { ActionButton } from './ActionButton';
import type { SelectFieldProps } from './SelectField.types';
import { Icon } from './Icon';

export function SelectField({ label, value, options, onChange, disabled, hideLabel = false, compact = false, borderless = false }: SelectFieldProps) {
  const colors = useTheme();
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}>
    {!hideLabel && <Text style={{ color: compact ? colors.muted : colors.text, fontWeight: compact ? '400' : '600', fontSize: compact ? 13 : 14 }}>{label}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find((option) => option.value === value)?.label ?? value}`} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => setOpen(true)} style={{ minHeight: compact ? 44 : 48, borderWidth: 1, borderColor: borderless ? 'transparent' : colors.border, borderRadius: compact ? 7 : 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
      <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: compact ? 14 : 16 }}>{options.find((option) => option.value === value)?.label ?? value}</Text><Icon name="chevron" size={15} color={colors.muted} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, justifyContent: 'center' }}>
        <View accessibilityViewIsModal style={{ maxHeight: '80%', backgroundColor: colors.background, padding: 20, gap: 16, borderRadius: 16 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{label}</Text>
          <ScrollView>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} onPress={() => { onChange(option.value); setOpen(false); }} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: 12 }}><Text style={{ color: option.value === value ? colors.primary : colors.text }}>{option.value === value ? '✓ ' : ''}{option.label}</Text></Pressable>)}</ScrollView>
          <ActionButton variant="secondary" label="선택 닫기" onPress={() => setOpen(false)} />
        </View>
      </View>
    </Modal>
  </View>;
}
