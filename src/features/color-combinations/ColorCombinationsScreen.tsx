import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { ColorOptions } from './ColorOptions';
import { colorPairings, guideColors, type BaseColorId } from './palettes';

export function ColorCombinationsScreen() {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<BaseColorId>('navy');
  const [contentWidth, setContentWidth] = useState(0);
  const base = guideColors[selected];
  const pairingTitle = `${base.label}${selected === 'black' || selected === 'brown' ? '과' : '와'} 어울리는 색상`;
  const columns = width >= 700 ? 4 : 3;
  const twoColumns = width >= 700;
  const pairingWidth = twoColumns && contentWidth > 0 ? Math.floor((contentWidth - 12) / 2) : '100%';

  return <View style={{ width: '100%', maxWidth: 1040, alignSelf: 'center', padding: width >= 700 ? 28 : 18, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.background, gap: 24 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <View style={{ flex: 1, gap: 7 }}><Text accessibilityRole="header" aria-level={1} style={{ color: colors.text, fontSize: 24, fontWeight: '800', lineHeight: 32 }}>색상 조합 가이드</Text><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>기준 색상을 선택해 보세요.</Text></View>
      <Icon name="palette" size={24} color={colors.primary} />
    </View>

    <View onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}>
      <ColorOptions selected={selected} onSelect={setSelected} columns={columns} width={contentWidth} />
    </View>

    <View style={{ height: 1, backgroundColor: colors.border }} />

    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" aria-level={2} accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '600' }}>{pairingTitle}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {colorPairings[selected].map((pair) => {
          const match = guideColors[pair.color];
          return <View key={`${selected}-${pair.color}`} style={{ width: pairingWidth, padding: 12, gap: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background }}>
            <View aria-hidden style={{ height: 72, flexDirection: 'row', gap: 3, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              <View style={{ flex: 1, backgroundColor: base.hex }} /><View style={{ flex: 1, backgroundColor: match.hex }} />
            </View>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 21 }}>{base.label} + {match.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{pair.description}</Text>
          </View>;
        })}
      </View>
    </View>

    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>상의·하의나 아우터에 두 색을 나눠 활용해 보세요. 소재와 색의 밝기에 따라 조합의 분위기는 달라질 수 있어요.</Text>
  </View>;
}
