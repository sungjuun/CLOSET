import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { SelectField } from '@/components/ui/SelectField';
import { useTheme } from '@/theme/useTheme';
import { Choice, WardrobeState } from '../wardrobe/components';
import { defaultFilters, type ListState, type WardrobeFilters } from '../wardrobe/filters';
import { useCategories, useWardrobeFilterOptions } from '../wardrobe/queries';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto } from '../wardrobe/photos/model';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { seasons, seasonLabels, wardrobePageSize } from '../wardrobe/types';
import { slotCategories, slotLabels, type OutfitSlot } from './draft';
import { useOutfitCandidates } from './queries';
import { selectionErrorMessage } from './selection';

export function OutfitPicker({ slot, selectedId, busy, onSelect }: { slot: OutfitSlot; selectedId: string | undefined; busy: boolean; onSelect: (id: string) => void }) {
  const colors = useTheme();
  const [state, setState] = useState<ListState>({ page: 0, filters: { ...defaultFilters, category: slotCategories[slot], status: 'active' } });
  const [search, setSearch] = useState('');
  const categories = useCategories();
  const options = useWardrobeFilterOptions();
  const query = useOutfitCandidates(slot, state.page, state.filters);
  const photos = usePhotos(query.data?.items.map((item) => item.id) ?? []);
  const [width, setWidth] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setState((previous) => previous.filters.search === search.trim() ? previous : { page: 0, filters: { ...previous.filters, search: search.trim() } }), 350); return () => clearTimeout(timer); }, [search]);
  const lastPage = query.data ? Math.max(0, Math.ceil(query.data.total / wardrobePageSize) - 1) : state.page;
  if (state.page > lastPage) setState({ ...state, page: lastPage });
  function change(patch: Partial<WardrobeFilters>) { setState((previous) => ({ page: 0, filters: { ...previous.filters, ...patch } })); }
  const all = { value: '', label: '전체' };
  const field = { flexBasis: '45%' as const, flexGrow: 1, minWidth: 0 };
  return <View style={{ gap: 16, width: '100%' }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{slotLabels[slot]} 고르기</Text>
    <Text style={{ color: colors.muted, lineHeight: 22 }}>내 옷장의 보유 중인 {slotLabels[slot]}만 표시합니다. 선택하면 기존 슬롯의 옷을 교체해요.</Text>
    <FormField label="선택할 옷 검색" placeholder="이름, 브랜드, 색상" maxLength={200} value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={() => change({ search: search.trim() })} />
    <SelectField label="선택할 옷 세부 분류" value={state.filters.category} disabled={categories.isPending || categories.isError} options={[{ value: slotCategories[slot], label: `${slotLabels[slot]} 전체` }, ...(categories.data ?? []).filter((category) => category.parent_slug === slotCategories[slot]).map((category) => ({ value: category.slug, label: category.label_ko }))]} onChange={(category) => change({ category })} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <View style={field}><SelectField label="선택할 옷 브랜드" value={state.filters.brand} disabled={options.isPending || options.isError} options={[all, ...(options.data?.brands ?? []).map((value) => ({ value, label: value }))]} onChange={(brand) => change({ brand })} /></View>
      <View style={field}><SelectField label="선택할 옷 색상" value={state.filters.color} disabled={options.isPending || options.isError} options={[all, ...(options.data?.colors ?? []).map((value) => ({ value, label: value }))]} onChange={(color) => change({ color })} /></View>
    </View>
    <SelectField label="선택할 옷 계절" value={state.filters.season} options={[all, ...seasons.map((value) => ({ value, label: seasonLabels[value] }))]} onChange={(season) => change({ season: season as WardrobeFilters['season'] })} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Choice label="즐겨찾기만" selected={state.filters.favoriteOnly} onPress={() => change({ favoriteOnly: !state.filters.favoriteOnly })} /><ActionButton variant="secondary" label="선택 필터 초기화" onPress={() => { setSearch(''); setState({ page: 0, filters: { ...defaultFilters, category: slotCategories[slot], status: 'active' } }); }} /></View>
    {(categories.isError || options.isError) && <WardrobeState title="일부 선택 필터를 불러오지 못했어요" message="다시 확인해 주세요." retry={() => { void Promise.all([categories.refetch(), options.refetch()]); }} />}
    {query.isPending ? <WardrobeState title="선택할 옷을 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="선택할 옷을 불러오지 못했어요" message={selectionErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.text }}>{query.data.total}개의 선택 가능한 옷</Text><ActionButton variant="secondary" label="옷 목록 새로고침" disabled={query.isFetching} onPress={() => { void query.refetch(); }} /></View>
      {query.data.items.length === 0 && <WardrobeState title="선택할 수 있는 옷이 없어요" message="검색 조건을 바꾸거나 내 옷장에 해당 종류의 옷을 등록해 주세요." />}
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {width > 0 && query.data.items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} ${slotLabels[slot]}에 선택`} aria-pressed={selectedId === item.id} disabled={busy} onPress={() => onSelect(item.id)} style={{ width: (width - 12) / 2, gap: 8, borderRadius: 10, padding: 8, borderWidth: 2, borderColor: selectedId === item.id ? colors.primary : colors.border, opacity: busy ? 0.5 : 1 }}><PhotoFrame photo={primaryPhoto(photos.data ?? [], item.id)} loading={photos.isPending} error={photos.isError} /><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{item.brand_name || '브랜드 미입력'}</Text><Text numberOfLines={2} style={{ color: colors.text, fontWeight: '700', fontSize: 13, lineHeight: 20 }}>{item.name}</Text><Text style={{ color: colors.primary, fontSize: 12 }}>{selectedId === item.id ? '선택됨' : '슬롯에 넣기'}</Text></Pressable>)}
      </View>
      {(state.page > 0 || query.data.total > wardrobePageSize) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}><ActionButton variant="secondary" label="선택 목록 이전 페이지" disabled={state.page === 0 || query.isFetching} onPress={() => setState((previous) => ({ ...previous, page: previous.page - 1 }))} /><Text style={{ color: colors.muted }}>{state.page + 1} / {lastPage + 1}</Text><ActionButton variant="secondary" label="선택 목록 다음 페이지" disabled={state.page >= lastPage || query.isFetching} onPress={() => setState((previous) => ({ ...previous, page: previous.page + 1 }))} /></View>}
    </>}
  </View>;
}
