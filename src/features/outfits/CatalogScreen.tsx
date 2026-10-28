import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { SearchField } from '@/components/ui/SearchField';
import { SelectField } from '@/components/ui/SelectField';
import { ActionButton } from '@/components/ui/ActionButton';
import { supabase } from '@/lib/supabase/client';
import { privateQueryKey } from '@/lib/query/keys';
import { useUserId } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { WardrobeHeader, WardrobeState } from '../wardrobe/components';
import { seasons, seasonLabels } from '../wardrobe/types';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto, type PrivatePhoto } from '../wardrobe/photos/model';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { slotLabels, slots } from './draft';
import { createOutfitCatalog, defaultOutfitCatalogFilters, outfitPageSize, type OutfitCatalogFilters, type SavedOutfit } from './catalog';

function OutfitCard({ outfit, number, photos, photoPending, photoError }: { outfit: SavedOutfit; number: number; photos: PrivatePhoto[]; photoPending: boolean; photoError: boolean }) {
  const colors = useTheme();
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background }}>
    <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted, fontSize: 12 }}>코디 이름</Text><Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{String(number).padStart(2, '0')}</Text></View>
      <Text accessibilityRole="header" aria-level={2} numberOfLines={2} style={{ color: colors.text, fontSize: 14, lineHeight: 22, minHeight: 42, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 6 }}>{outfit.name}</Text>
    </View>
    <View style={{ padding: 16, gap: 12, minHeight: 90 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{outfit.tags.length ? outfit.tags.slice(0, 4).map((tag) => <Text key={tag} style={{ color: colors.primary, backgroundColor: colors.surface, fontSize: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 4 }}>#{tag}</Text>) : <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 5 }}>{outfit.occasion || '태그 없음'}</Text>}</View>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: 12 }}>계절</Text>{outfit.seasons.length ? outfit.seasons.map((season) => <Text key={season} style={{ color: colors.text, backgroundColor: colors.surface, fontSize: 12, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4 }}>{seasonLabels[season as keyof typeof seasonLabels] ?? season}</Text>) : <Text style={{ color: colors.muted, fontSize: 12 }}>미지정</Text>}</View>
    </View>
    <View style={{ backgroundColor: colors.board, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {slots.slice(0, 4).map((slot) => {
        const entry = outfit.outfit_items.find((row) => row.slot === slot && row.position === 0);
        const item = entry?.item;
        const available = item && !item.deleted_at;
        const contents = <><View style={{ padding: 8, aspectRatio: 1.2, justifyContent: 'center', backgroundColor: colors.surface }}>
          {available ? <PhotoFrame aspectRatio={1.25} photo={primaryPhoto(photos, item.id)} loading={photoPending} error={photoError} /> : <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>{item?.deleted_at ? '삭제된 옷' : `${slotLabels[slot]} 없음`}</Text>}
        </View><Text style={{ color: colors.text, borderTopWidth: 1, borderTopColor: colors.border, textAlign: 'center', paddingVertical: 9, fontSize: 12, fontWeight: '700' }}>{slotLabels[slot]}</Text></>;
        return <View key={slot} style={{ width: '48%', flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderColor: '#D3D8E3', borderRadius: 7, backgroundColor: colors.background, overflow: 'hidden' }}>{available ? <Link href={{ pathname: '/wardrobe/[itemId]', params: { itemId: item.id } }} asChild><Pressable accessibilityRole="link" accessibilityLabel={`${outfit.name} · ${slotLabels[slot]} ${item.name} 상세 보기`}>{contents}</Pressable></Link> : contents}</View>;
      })}
      {outfit.outfit_items.some((entry) => !slots.slice(0, 4).some((slot) => slot === entry.slot)) && <Text style={{ color: colors.muted, fontSize: 11, padding: 4 }}>원피스·가방·액세서리 포함</Text>}
    </View>
  </View>;
}

export function OutfitCatalogScreen() {
  const colors = useTheme();
  const owner = useUserId()!;
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const [search, setSearch] = useState('');
  const [state, setState] = useState({ page: 0, filters: defaultOutfitCatalogFilters });
  const { page, filters } = state;
  const query = useQuery({ queryKey: privateQueryKey(owner, 'outfits', { kind: 'catalog', page, ...filters }), queryFn: ({ signal }) => createOutfitCatalog(supabase!, owner).list(page, filters, signal), refetchOnMount: 'always' });
  const ids = [...new Set(query.data?.items.flatMap((outfit) => outfit.outfit_items.flatMap((entry) => entry.item && !entry.item.deleted_at ? [entry.item.id] : [])) ?? [])];
  const photos = usePhotos(ids);
  useEffect(() => { const timer = setTimeout(() => setState((previous) => previous.filters.search === search.trim() ? previous : { page: 0, filters: { ...previous.filters, search: search.trim() } }), 350); return () => clearTimeout(timer); }, [search]);
  const lastPage = query.data ? Math.max(0, Math.ceil(query.data.total / outfitPageSize) - 1) : page;
  if (page > lastPage) setState({ ...state, page: lastPage });
  function change(patch: Partial<OutfitCatalogFilters>) { setState((previous) => ({ page: 0, filters: { ...previous.filters, ...patch } })); }
  const columns = width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  return <View style={{ gap: 24 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><WardrobeHeader title="저장한 코디" description="마음에 들었던 조합을 다시 꺼내 보세요." /></View><Link href="/outfits/new" asChild><Pressable accessibilityRole="button" accessibilityLabel="새 코디" style={{ backgroundColor: colors.primary, borderRadius: 7, minHeight: 42, paddingHorizontal: 16, gap: 7, flexDirection: 'row', alignItems: 'center' }}><Icon name="plus" color={colors.onPrimary} size={16} /><Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '700' }}>새 코디</Text></Pressable></Link></View>
    <View style={{ gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}><View style={{ width: '100%', maxWidth: 380 }}><SearchField label="코디 검색" placeholder="코디 이름 · 메모 검색" value={search} onChange={setSearch} onSubmit={() => change({ search: search.trim() })} /></View><Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{query.data?.total ?? '—'}</Text>개의 목록 / 전체 {query.data?.allTotal ?? '—'}개</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>{(['', ...seasons] as const).map((season) => <Pressable key={season} accessibilityRole="button" aria-pressed={filters.season === season} onPress={() => change({ season })} style={{ minHeight: 32, minWidth: 40, paddingHorizontal: 10, borderWidth: 1, borderRadius: 6, justifyContent: 'center', borderColor: filters.season === season ? colors.primary : colors.border, backgroundColor: filters.season === season ? colors.surface : colors.background }}><Text style={{ color: filters.season === season ? colors.primary : colors.text, fontSize: 12 }}>{season ? seasonLabels[season] : '전체'}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="코디 필터 초기화" onPress={() => { setSearch(''); setState({ page: 0, filters: defaultOutfitCatalogFilters }); }} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}><Icon name="refresh" size={14} color={colors.text} /><Text style={{ color: colors.text, fontSize: 12 }}>필터 초기화</Text></Pressable></View>
        <View style={{ width: 138 }}><SelectField compact hideLabel borderless label="코디 정렬" value={filters.sort} options={[{ value: 'recent', label: '최근 추가순' }, { value: 'oldest', label: '오래된 추가순' }, { value: 'name', label: '이름순' }]} onChange={(value) => change({ sort: value as OutfitCatalogFilters['sort'] })} /></View>
      </View>
    </View>
    {query.isPending ? <WardrobeState title="코디를 불러오는 중" message="저장한 조합을 준비하고 있어요." /> : query.isError ? <WardrobeState title="코디를 불러오지 못했어요" message="연결을 확인하고 다시 시도해 주세요." retry={() => { void query.refetch(); }} /> : query.data.items.length === 0 ? <WardrobeState title={filters.search || filters.season ? '조건에 맞는 코디가 없어요' : '아직 저장한 코디가 없어요'} message={filters.search || filters.season ? '검색어나 계절을 바꿔 보세요.' : '새 코디에서 내 옷으로 조합을 만들어 보세요.'} /> : <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>{gridWidth > 0 && query.data.items.map((outfit, index) => <View key={outfit.id} style={{ width: (gridWidth - 20 * (columns - 1)) / columns }}><OutfitCard outfit={outfit} number={page * outfitPageSize + index + 1} photos={photos.data ?? []} photoPending={photos.isPending} photoError={photos.isError} /></View>)}</View>}
    {query.data && query.data.total > outfitPageSize && <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}><ActionButton variant="secondary" label="코디 이전 페이지" disabled={page === 0 || query.isFetching} onPress={() => setState({ ...state, page: page - 1 })} /><Text style={{ color: colors.muted }}>{page + 1} / {lastPage + 1}</Text><ActionButton variant="secondary" label="코디 다음 페이지" disabled={page === lastPage || query.isFetching} onPress={() => setState({ ...state, page: page + 1 })} /></View>}
  </View>;
}
