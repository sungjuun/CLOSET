import { Pressable, useWindowDimensions, View } from 'react-native';
import { SelectField } from '@/components/ui/SelectField';
import { SearchField } from '@/components/ui/SearchField';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import type { WardrobeFilters } from './filters';
import type { Category } from './types';
import { isRetiredCategory } from '../categories/model';

type Props = {
  filters: WardrobeFilters; search: string; onSearch: (text: string) => void;
  onChange: (patch: Partial<WardrobeFilters>) => void;
  categories: Category[]; colors: string[];
  loadingCategories: boolean; loadingOptions: boolean;
};
const all = { value: '', label: '전체' };

export function WardrobeFilterBar(props: Props) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 768;
  const { filters, categories, onChange } = props;
  const selected = categories.find((category) => category.slug === filters.category);
  const root = selected?.parent_slug ?? selected?.slug ?? '';
  const children = categories.filter((category) => category.parent_slug === root);
  const colorOptions = [{ value: '', label: '모든 색상' }, ...[...new Set([...props.colors, ...(filters.color ? [filters.color] : [])])].map((value) => ({ value, label: value }))];
  return <View style={{ gap: mobile ? 20 : 28 }}>
    <View style={{ flexDirection: 'row', gap: 12, width: '100%', maxWidth: mobile ? undefined : 500 }}>
      <View style={{ flex: 0.85, minWidth: 0 }}><SelectField compact label="옷 종류" value={root} options={[all, ...categories.filter((category) => !category.parent_slug && (!isRetiredCategory(category) || category.slug === root)).map((category) => ({ value: category.slug, label: category.label_ko }))]} disabled={props.loadingCategories} onChange={(category) => onChange({ category })} /></View>
      <View style={{ flex: 1.15, minWidth: 0 }}><SelectField compact label="세부 분류" value={selected?.parent_slug ? selected.slug : ''} options={[all, ...children.map((category) => ({ value: category.slug, label: category.label_ko }))]} disabled={props.loadingCategories || !root || !children.length} onChange={(category) => onChange({ category: category || root })} /></View>
    </View>
    <View style={{ flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: mobile ? 12 : 20 }}>
      <View style={{ width: mobile ? '100%' : 310 }}><SearchField label="옷 검색" placeholder="이름, 브랜드, 색상으로 검색" value={props.search} onChange={props.onSearch} onSubmit={() => onChange({ search: props.search.trim() })} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: mobile ? 'space-between' : 'flex-end', gap: 8 }}>
        <View style={{ width: mobile ? 112 : 108 }}><SelectField compact hideLabel label="색상" value={filters.color} options={colorOptions} disabled={props.loadingOptions} onChange={(color) => onChange({ color })} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="즐겨찾기만 보기" aria-pressed={filters.favoriteOnly} accessibilityState={{ selected: filters.favoriteOnly }} onPress={() => onChange({ favoriteOnly: !filters.favoriteOnly })} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 7, borderColor: filters.favoriteOnly ? colors.favorite : colors.border, backgroundColor: filters.favoriteOnly ? colors.surface : colors.background }}>
          <Icon name="heart" size={18} color={filters.favoriteOnly ? colors.favorite : colors.muted} filled={filters.favoriteOnly} />
        </Pressable>
      </View>
    </View>
  </View>;
}
