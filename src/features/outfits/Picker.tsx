import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { SelectField } from '@/components/ui/SelectField';
import { useTheme } from '@/theme/useTheme';
import { WardrobeState } from '../wardrobe/components';
import { defaultFilters, type ListState, type WardrobeFilters } from '../wardrobe/filters';
import { useCategories, useWardrobeFilterOptions } from '../wardrobe/queries';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto } from '../wardrobe/photos/model';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { seasons, seasonLabels, wardrobePageSize } from '../wardrobe/types';
import { slotCategories, slotDisplayLabel, type OutfitSlot } from './draft';
import { OutfitControl } from './EditorControls';
import { useOutfitCandidates } from './queries';
import { selectionErrorMessage } from './selection';

type Props = { slot: OutfitSlot; selectedId: string | undefined; busy: boolean; onSelect: (id: string) => void; onSlotChange?: (slot: OutfitSlot) => void };
export function OutfitPicker({ slot, selectedId, busy, onSelect, onSlotChange }: Props) {
  const colors = useTheme();
  const viewport = useWindowDimensions();
  const [state, setState] = useState<ListState>({ page: 0, filters: { ...defaultFilters, category: slotCategories[slot], status: 'active' } });
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const categories = useCategories();
  const options = useWardrobeFilterOptions();
  const query = useOutfitCandidates(slot, state.page, state.filters);
  const photos = usePhotos(query.data?.items.map(item => item.id) ?? []);
  const [width, setWidth] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setState(previous => previous.filters.search === search.trim() ? previous : { page: 0, filters: { ...previous.filters, search: search.trim() } }), 350); return () => clearTimeout(timer); }, [search]);
  const lastPage = query.data ? Math.max(0, Math.ceil(query.data.total / wardrobePageSize) - 1) : state.page;
  if (state.page > lastPage) setState({ ...state, page: lastPage });
  function change(patch: Partial<WardrobeFilters>) { setState(previous => ({ page: 0, filters: { ...previous.filters, ...patch } })); }
  const columns = width >= 380 ? 3 : 2;
  const cardWidth = Math.max(0, Math.floor((width - (columns - 1) * 12) / columns));
  const imageHeight = Math.min(160, Math.max(110, cardWidth));
  const extraFilters = Number(Boolean(state.filters.color)) + Number(Boolean(state.filters.season)) + Number(state.filters.favoriteOnly);
  const tabs: OutfitSlot[] = ['outerwear', 'top', 'bottom', 'shoes', 'bag', 'accessory', ...(slot === 'onepiece' ? ['onepiece' as const] : [])];
  const all = { value: '', label: '전체' };
  const field = { flexBasis: '45%' as const, flexGrow: 1, minWidth: 0 };
  return <View style={{ width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background }}>
    <View style={{ padding: 16, gap: 5, borderBottomWidth: 1, borderColor: colors.border }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>내 옷장에서 고르기</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{slotDisplayLabel(slot, categories.data ?? [])}에 넣을 보유 중인 옷을 골라주세요.</Text></View>
    <View style={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}><Icon name="search" size={17} color={colors.muted} /><TextInput accessibilityLabel="선택할 옷 검색" placeholder="이름, 브랜드, 색상으로 검색" placeholderTextColor={colors.muted} maxLength={200} value={search} editable={!busy} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={() => change({ search: search.trim() })} style={{ flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10, color: colors.text, fontSize: viewport.width >= 1024 ? 14 : 16 }} /></View>
      {onSlotChange && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{tabs.map(tab => <OutfitControl key={tab} label={slotDisplayLabel(tab, categories.data ?? [])} selected={slot === tab} disabled={busy} onPress={() => onSlotChange(tab)} style={{ paddingHorizontal: 10 }} />)}</View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <View style={field}><SelectField compact hideLabel label="선택할 옷 세부 분류" value={state.filters.category} disabled={busy || categories.isPending || categories.isError} options={[{ value: slotCategories[slot], label: `${slotDisplayLabel(slot, categories.data ?? [])} 전체` }, ...(categories.data ?? []).filter(category => category.parent_slug === slotCategories[slot]).map(category => ({ value: category.slug, label: category.label_ko }))]} onChange={category => change({ category })} /></View>
        <View style={field}><SelectField compact hideLabel label="선택할 옷 브랜드" value={state.filters.brand} disabled={busy || options.isPending || options.isError} options={[{ value: '', label: '모든 브랜드' }, ...(options.data?.brands ?? []).map(value => ({ value, label: value }))]} onChange={brand => change({ brand })} /></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}><OutfitControl variant="quiet" icon="filters" label={`색상·계절·즐겨찾기${extraFilters ? ` (${extraFilters})` : ''}`} expanded={filtersOpen} disabled={busy} onPress={() => setFiltersOpen(value => !value)} /><OutfitControl variant="quiet" icon="refresh" label="선택 필터 초기화" disabled={busy} onPress={() => { setSearch(''); setState({ page: 0, filters: { ...defaultFilters, category: slotCategories[slot], status: 'active' } }); }} /></View>
      {filtersOpen && <View style={{ gap: 10, padding: 12, borderRadius: 8, backgroundColor: colors.surface }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <View style={field}><SelectField compact hideLabel label="선택할 옷 색상" value={state.filters.color} disabled={busy || options.isPending || options.isError} options={[all, ...(options.data?.colors ?? []).map(value => ({ value, label: value }))]} onChange={color => change({ color })} /></View>
        <View style={field}><SelectField compact hideLabel label="선택할 옷 계절" value={state.filters.season} disabled={busy} options={[all, ...seasons.map(value => ({ value, label: seasonLabels[value] }))]} onChange={season => change({ season: season as WardrobeFilters['season'] })} /></View>
      </View><OutfitControl label="즐겨찾기만" icon="heart" selected={state.filters.favoriteOnly} disabled={busy} onPress={() => change({ favoriteOnly: !state.filters.favoriteOnly })} /></View>}
      {(categories.isError || options.isError) && <WardrobeState title="일부 선택 필터를 불러오지 못했어요" message="다시 확인해 주세요." retry={() => { void Promise.all([categories.refetch(), options.refetch()]); }} />}
      {query.isPending ? <WardrobeState title="선택할 옷을 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="선택할 옷을 불러오지 못했어요" message={selectionErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.muted, fontSize: 12 }}>{query.data.total}개의 옷</Text><OutfitControl variant="quiet" icon="refresh" iconOnly label="옷 목록 새로고침" disabled={query.isFetching || busy} onPress={() => { void query.refetch(); }} /></View>
        {query.data.items.length === 0 && <View style={{ minHeight: 160, padding: 18, justifyContent: 'center', alignItems: 'center', gap: 9 }}><Text style={{ color: colors.text, fontSize: 14 }}>선택할 수 있는 옷이 없어요</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: 'center' }}>검색 조건을 바꾸거나 해당 종류의 옷을 등록해 주세요.</Text></View>}
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={viewport.width >= 1024 ? { maxHeight: Math.max(400, viewport.height - 480) } : undefined} contentContainerStyle={{ paddingBottom: 2 }}>
        <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {width > 0 && query.data.items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} ${slotDisplayLabel(slot, categories.data ?? [])}에 선택`} accessibilityState={{ disabled: busy, selected: selectedId === item.id }} aria-pressed={selectedId === item.id} disabled={busy} onPress={() => onSelect(item.id)} style={{ width: cardWidth, gap: 6, minWidth: 0, opacity: busy ? 0.5 : 1 }}>
            <View style={{ borderRadius: 8, borderWidth: 1, padding: 1, borderColor: selectedId === item.id ? colors.primary : 'transparent' }}><PhotoFrame photo={primaryPhoto(photos.data ?? [], item.id)} loading={photos.isPending} error={photos.isError} aspectRatio={Math.max(1, cardWidth - 4) / imageHeight} borderRadius={6} />{selectedId === item.id && <View style={{ position: 'absolute', top: 7, right: 7, width: 21, height: 21, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.onPrimary, fontSize: 12 }}>✓</Text></View>}</View>
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{item.brand_name || '브랜드 미입력'}</Text><Text numberOfLines={2} style={{ color: colors.text, fontSize: 12, lineHeight: 18, minHeight: 36 }}>{item.name}</Text>
          </Pressable>)}
        </View>
        </ScrollView>
        {(state.page > 0 || query.data.total > wardrobePageSize) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 }}><OutfitControl label="이전 페이지" disabled={state.page === 0 || query.isFetching || busy} onPress={() => setState(previous => ({ ...previous, page: previous.page - 1 }))} /><Text style={{ color: colors.muted, fontSize: 12 }}>{state.page + 1} / {lastPage + 1}</Text><OutfitControl label="다음 페이지" disabled={state.page >= lastPage || query.isFetching || busy} onPress={() => setState(previous => ({ ...previous, page: previous.page + 1 }))} /></View>}
      </>}
    </View>
  </View>;
}
