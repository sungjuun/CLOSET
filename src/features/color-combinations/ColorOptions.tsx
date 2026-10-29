import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { baseColorIds, guideColors } from './palettes';
import type { ColorOptionsProps } from './ColorOptions.types';

export function ColorOptions({ selected, onSelect, columns, width }: ColorOptionsProps) {
  const colors = useTheme();
  const itemWidth = width > 0 ? Math.floor((width - 12 * (columns - 1)) / columns) : undefined;
  return <View accessibilityRole="radiogroup" accessibilityLabel="기준 색상" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
    {baseColorIds.map((id) => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={`${guideColors[id].label} 기준 색상`} accessibilityState={{ checked: selected === id }} onPress={() => onSelect(id)}
      style={({ pressed }) => ({ width: itemWidth, minHeight: 90, borderWidth: 2, borderColor: selected === id ? colors.primary : colors.border, borderRadius: 12, padding: 10, gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: guideColors[id].hex, borderWidth: 1, borderColor: colors.border }} />
      <Text style={{ fontSize: 13, fontWeight: selected === id ? '700' : '500', color: colors.text }}>{guideColors[id].label}{selected === id ? ' ✓' : ''}</Text>
    </Pressable>)}
  </View>;
}
