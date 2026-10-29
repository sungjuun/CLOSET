import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { tone } from './finder';
import type { ColorGridProps } from './ColorGrid.types';

export function ColorGrid({ colors: choices, selected, onSelect, width, columns, label }: ColorGridProps) {
  const colors = useTheme();
  const itemWidth = width > 0 ? Math.floor((width - 8 * (columns - 1)) / columns) : 66;
  return <View accessibilityRole="none" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {choices.map((color) => <Pressable key={color.id} accessibilityRole="button" accessibilityLabel={`${label} ${color.label}`} accessibilityState={{ selected: selected === color.id }} aria-pressed={selected === color.id} onPress={() => onSelect(color.id)}
      style={{ width: itemWidth, minHeight: 78, padding: 4, gap: 6, alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, padding: 4, borderWidth: 1.5, borderColor: selected === color.id ? colors.primary : 'transparent' }}><View style={{ flex: 1, borderRadius: 18, backgroundColor: color.hex, borderWidth: 1, borderColor: '#AEB4B5', alignItems: 'center', justifyContent: 'center' }}>{selected === color.id && <Icon name="check" size={21} color={tone(color.hex).lightness > 0.6 ? '#222530' : '#FFFFFF'} />}</View></View>
      <Text style={{ textAlign: 'center', color: selected === color.id ? colors.text : colors.muted, fontSize: 11, lineHeight: 16, fontWeight: selected === color.id ? '700' : '400' }}>{color.label}</Text>
    </Pressable>)}
  </View>;
}
