import { Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { footFieldKey, footSides, pairedShoeGroups, recommendedShoeFields, type ShoeDraft, type ShoeKey } from './shoeFit';

type Props = {
  values: ShoeDraft;
  disabled?: boolean;
  onChange?: (key: ShoeKey, value: string) => void;
};

export function ShoeFitPanel({ values, disabled, onChange }: Props) {
  const colors = useTheme();
  const heading = { color: colors.text, fontSize: 14, fontWeight: '700' as const };

  function valueCell(key: ShoeKey, label: string, unit: '' | 'mm') {
    const value = values[key] ?? '';
    if (onChange) return <TextInput accessibilityLabel={unit ? `${label} (${unit})` : label}
      value={value} placeholder={unit || '—'} placeholderTextColor={colors.muted} editable={!disabled}
      keyboardType={unit === 'mm' ? 'number-pad' : 'default'} maxLength={unit === 'mm' ? 3 : 48}
      onChangeText={(text) => onChange(key, text)}
      style={{ minHeight: 44, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, color: colors.text, backgroundColor: colors.background }} />;
    return <Text style={{ color: colors.text, fontWeight: value ? '600' : '400' }}>{value ? `${value}${unit ? ` ${unit}` : ''}` : '—'}</Text>;
  }

  const recommendation = recommendedShoeFields.filter(({ key }) => onChange || values[key]);
  return <View style={{ gap: 16 }}>
    {pairedShoeGroups.map((group) => {
      const rows = group.fields.filter(({ key }) => onChange || footSides.some((side) => values[footFieldKey(key, side.key)]));
      if (!rows.length) return null;
      return <View key={group.key} style={{ gap: 9 }}>
        <Text accessibilityRole="header" style={heading}>{group.title}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={{ flex: 1.4, color: colors.muted, fontSize: 12 }}>항목</Text>
          {footSides.map((side) => <Text key={side.key} style={{ flex: 1, color: colors.muted, fontSize: 12 }}>{side.label}</Text>)}
        </View>
        {rows.map((row) => <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7 }}>
          <Text style={{ flex: 1.4, minWidth: 0, color: colors.text, fontSize: 13 }}>{row.label}{onChange && row.unit ? ` (${row.unit})` : ''}</Text>
          {footSides.map((side) => <View key={side.key} style={{ flex: 1, minWidth: 0 }}>
            {valueCell(footFieldKey(row.key, side.key), `${group.title} ${side.label} ${row.label}`, row.unit)}
          </View>)}
        </View>)}
      </View>;
    })}
    {recommendation.length > 0 && <View style={{ gap: 10, backgroundColor: colors.surface, padding: 12, borderRadius: 8 }}>
      <Text accessibilityRole="header" style={heading}>플릿러너 추천 신발</Text>
      {recommendation.map((field) => <View key={field.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1.4, minWidth: 0, color: colors.text, fontSize: 13 }}>{field.label}{onChange && field.unit ? ` (${field.unit})` : ''}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>{valueCell(field.key, `플릿러너 추천 ${field.label}`, field.unit)}</View>
      </View>)}
    </View>}
  </View>;
}
