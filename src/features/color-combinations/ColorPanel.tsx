import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { ColorGrid } from './ColorGrid';
import { colorOf, matchingColors, outfitColors, type ColorId } from './finder';

export function ColorPanel({ slot, selected, other, onSelect, compact }: { slot: 'top' | 'bottom'; selected: ColorId | null; other: ColorId | null; onSelect: (id: ColorId) => void; compact: boolean }) {
  const colors = useTheme(); const [expanded, setExpanded] = useState(false); const [width, setWidth] = useState(0);
  const label = slot === 'top' ? '상의' : '하의';
  const ranked = other ? matchingColors(other, slot) : [...outfitColors];
  const first = ranked.slice(0, other ? 8 : compact ? 12 : 26);
  if (selected && !first.some((color) => color.id === selected)) first.push(colorOf(selected));
  const choices = expanded ? ranked : first;
  const columns = Math.max(3, Math.min(7, Math.floor((width + 8) / 72)));
  return <View style={{ flex: 1, minWidth: 0, padding: compact ? 16 : 24, gap: 16, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
    <View style={{ gap: 7 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ fontSize: 20, color: colors.muted, fontStyle: 'italic' }}>{slot === 'top' ? '1' : '2'}</Text><Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{label} 선택</Text></View>
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: colors.muted, lineHeight: 20 }}>{selected ? `'${colorOf(selected).label}' 선택됨 · 다시 누르면 해제됩니다.` : `${label} 색상을 골라보세요.`}</Text>
      {other && <Text style={{ fontSize: 12, color: colors.primary, lineHeight: 20 }}>상대 색과 맞추기 쉬운 조합을 먼저 보여드려요.</Text>}
    </View>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}><ColorGrid colors={choices} selected={selected} onSelect={onSelect} width={width} columns={columns} label={label} /></View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ minHeight: 44, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 6 }}><Text style={{ fontSize: 12, color: colors.text, textAlign: 'center' }}>{expanded ? '주요 색상만 보기' : `전체 ${outfitColors.length}색 보기`}</Text></Pressable>
  </View>;
}
