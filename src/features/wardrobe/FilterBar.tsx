import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SelectField } from '@/components/ui/SelectField';
import { SearchField } from '@/components/ui/SearchField';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { defaultFilters, hasFilters, type WardrobeFilters } from './filters';
import { lifecycleLabels, seasonLabels, seasons, type Category } from './types';

type Props = {
  filters: WardrobeFilters; search: string; onSearch: (text: string) => void;
  onChange: (patch: Partial<WardrobeFilters>) => void; onReset: () => void;
  categories: Category[]; brands: string[]; colors: string[];
  loadingCategories: boolean; loadingOptions: boolean;
};
const all = { value: '', label: '전체' };
function textOptions(values: string[], selected: string, label = '전체') {
  return [{ value: '', label }, ...[...new Set([...values, ...(selected ? [selected] : [])])].map((value) => ({ value, label: value }))];
}

export function WardrobeFilterBar(props: Props) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const mobile = width < 768;
  const { filters, categories, onChange } = props;
  const selected = categories.find((category) => category.slug === filters.category);
  const root = selected?.parent_slug ?? selected?.slug ?? '';
  const children = categories.filter((category) => category.parent_slug === root);
  const advancedCount = [filters.brand, filters.season, filters.status].filter(Boolean).length;
  const canReset = hasFilters(filters) || Boolean(props.search) || filters.sort !== defaultFilters.sort;
  return <View style={{ gap: mobile ? 20 : 28 }}>
    <View style={{ flexDirection: 'row', gap: 12, width: '100%', maxWidth: mobile ? undefined : 500 }}>
      <View style={{ flex: 0.85, minWidth: 0 }}><SelectField compact label="옷 종류" value={root} options={[all, ...categories.filter((category) => !category.parent_slug).map((category) => ({ value: category.slug, label: category.label_ko }))]} disabled={props.loadingCategories} onChange={(category) => onChange({ category })} /></View>
      <View style={{ flex: 1.15, minWidth: 0 }}><SelectField compact label="세부 분류" value={selected?.parent_slug ? selected.slug : ''} options={[all, ...children.map((category) => ({ value: category.slug, label: category.label_ko }))]} disabled={props.loadingCategories || !root || !children.length} onChange={(category) => onChange({ category: category || root })} /></View>
    </View>
    <View style={{ flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'stretch' : 'center', gap: mobile ? 12 : 20 }}>
      <View style={{ width: mobile ? '100%' : 310 }}><SearchField label="옷 검색" placeholder="이름, 브랜드, 색상으로 검색" value={props.search} onChange={props.onSearch} onSubmit={() => onChange({ search: props.search.trim() })} /></View>
      <View style={{ flex: mobile ? undefined : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="상세 필터" accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpanded((value) => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="filters" size={18} color={advancedCount || expanded ? colors.primary : colors.muted} />
          <Text style={{ fontSize: 12, color: advancedCount || expanded ? colors.primary : colors.muted }}>{mobile ? '필터' : '상세 필터'}{advancedCount ? ` ${advancedCount}` : ''}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ width: mobile ? 112 : 108 }}><SelectField compact hideLabel label="색상" value={filters.color} options={textOptions(props.colors, filters.color, '모든 색상')} disabled={props.loadingOptions} onChange={(color) => onChange({ color })} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="즐겨찾기만" aria-pressed={filters.favoriteOnly} accessibilityState={{ selected: filters.favoriteOnly }} onPress={() => onChange({ favoriteOnly: !filters.favoriteOnly })} style={{ minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 7, borderColor: filters.favoriteOnly ? colors.primary : colors.border, backgroundColor: filters.favoriteOnly ? colors.surface : colors.background }}>
            <Icon name="heart" size={18} color={filters.favoriteOnly ? colors.primary : colors.muted} filled={filters.favoriteOnly} /><Text style={{ color: filters.favoriteOnly ? colors.primary : colors.muted, fontSize: 13 }}>즐겨찾기</Text>
          </Pressable>
        </View>
      </View>
    </View>
    {(expanded || canReset) && <View style={{ gap: 14, padding: expanded ? 16 : 0, backgroundColor: expanded ? colors.surface : undefined, borderRadius: 8 }}>
      {expanded && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: mobile ? '45%' : '28%', minWidth: 0 }}><SelectField compact label="브랜드" value={filters.brand} options={textOptions(props.brands, filters.brand)} disabled={props.loadingOptions} onChange={(brand) => onChange({ brand })} /></View>
        <View style={{ flexGrow: 1, flexBasis: mobile ? '45%' : '28%', minWidth: 0 }}><SelectField compact label="계절" value={filters.season} options={[all, ...seasons.map((season) => ({ value: season, label: seasonLabels[season] }))]} onChange={(season) => onChange({ season: season as WardrobeFilters['season'] })} /></View>
        <View style={{ flexGrow: 1, flexBasis: mobile ? '45%' : '28%', minWidth: 0 }}><SelectField compact label="상태" value={filters.status} options={[all, ...Object.entries(lifecycleLabels).map(([value, label]) => ({ value, label }))]} onChange={(status) => onChange({ status: status as WardrobeFilters['status'] })} /></View>
      </View>}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" disabled={!canReset} onPress={props.onReset} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: canReset ? 1 : 0.4 }}><Icon name="refresh" size={15} color={colors.text} /><Text style={{ color: colors.text, fontSize: 12 }}>필터 초기화</Text></Pressable>
        {expanded && <Link href="/wardrobe/trash" style={{ color: colors.muted, fontSize: 12, paddingVertical: 14 }}>휴지통 보기 ↗</Link>}
      </View>
    </View>}
  </View>;
}
