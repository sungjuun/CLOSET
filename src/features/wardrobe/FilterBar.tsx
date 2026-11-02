import { useWindowDimensions, View } from 'react-native';
import { SelectField } from '@/components/ui/SelectField';
import { SearchField } from '@/components/ui/SearchField';
import type { WardrobeFilters } from './filters';
import type { Category } from './types';
import { isRetiredCategory } from '../categories/model';

type Props = {
  filters: WardrobeFilters; search: string; onSearch: (text: string) => void;
  onChange: (patch: Partial<WardrobeFilters>) => void;
  categories: Category[];
  loadingCategories: boolean;
};
const all = { value: '', label: '전체' };

export function WardrobeFilterBar(props: Props) {
  const { width } = useWindowDimensions();
  const mobile = width < 768;
  const { filters, categories, onChange } = props;
  const selected = categories.find((category) => category.slug === filters.category);
  const root = selected?.parent_slug ?? selected?.slug ?? '';
  const children = categories.filter((category) => category.parent_slug === root);
  return <View style={{ gap: mobile ? 20 : 28 }}>
    <View style={{ flexDirection: 'row', gap: 12, width: '100%', maxWidth: mobile ? undefined : 500 }}>
      <View style={{ flex: 0.85, minWidth: 0 }}><SelectField compact label="옷 종류" value={root} options={[all, ...categories.filter((category) => !category.parent_slug && (!isRetiredCategory(category) || category.slug === root)).map((category) => ({ value: category.slug, label: category.label_ko }))]} disabled={props.loadingCategories} onChange={(category) => onChange({ category })} /></View>
      <View style={{ flex: 1.15, minWidth: 0 }}><SelectField compact label="세부 분류" value={selected?.parent_slug ? selected.slug : ''} options={[all, ...children.map((category) => ({ value: category.slug, label: category.label_ko }))]} disabled={props.loadingCategories || !root || !children.length} onChange={(category) => onChange({ category: category || root })} /></View>
    </View>
    <View style={{ width: mobile ? '100%' : 310 }}><SearchField label="옷 검색" placeholder="이름, 브랜드, 색상으로 검색" value={props.search} onChange={props.onSearch} onSubmit={() => onChange({ search: props.search.trim() })} /></View>
  </View>;
}
