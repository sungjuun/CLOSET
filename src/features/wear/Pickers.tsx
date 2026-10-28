import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { SearchField } from '@/components/ui/SearchField';
import { SelectField } from '@/components/ui/SelectField';
import { supabase } from '@/lib/supabase/client';
import { useUserId } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { createOutfitCatalog, defaultOutfitCatalogFilters, outfitCatalogKeys, outfitPageSize } from '../outfits/catalog';
import { defaultFilters } from '../wardrobe/filters';
import { useCategories, useWardrobeList } from '../wardrobe/queries';
import { wardrobePageSize } from '../wardrobe/types';
import { Choice, WardrobeState } from '../wardrobe/components';
import { usePhotos } from '../wardrobe/photos/hooks';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { primaryPhoto } from '../wardrobe/photos/model';
import type { ChosenWearOutfit } from './calendar';
import { maxWearItems } from './model';

export function WearOutfitPicker({ selected, disabled, onChoose }: { selected: ChosenWearOutfit | null; disabled: boolean; onChoose: (value: ChosenWearOutfit) => void }) {
  const colors = useTheme(); const owner = useUserId()!;
  const [text, setText] = useState('');
  const [state, setState] = useState({ page: 0, filters: defaultOutfitCatalogFilters });
  useEffect(() => { const timer = setTimeout(() => setState((previous) => previous.filters.search === text.trim() ? previous : { page: 0, filters: { ...previous.filters, search: text.trim() } }), 350); return () => clearTimeout(timer); }, [text]);
  const query = useQuery({ queryKey: outfitCatalogKeys.list(owner, state.page, state.filters), queryFn: ({ signal }) => createOutfitCatalog(supabase!, owner).list(state.page, state.filters, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
  const last = query.data ? Math.max(0, Math.ceil(query.data.total / outfitPageSize) - 1) : state.page;
  if (state.page > last) setState({ ...state, page: last });
  return <View style={{ gap: 12 }}>
    <SearchField label="기록할 코디 검색" placeholder="코디 이름 · 태그 · 브랜드" value={text} onChange={setText} />
    <ActionButton variant="secondary" label="코디 목록 새로고침" disabled={disabled || query.isFetching} onPress={() => { void query.refetch(); }} />
    {selected && <Text style={{ color: colors.primary }}>선택한 코디: {selected.name}</Text>}
    {query.isPending ? <WardrobeState title="코디를 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="코디를 불러오지 못했어요" message="연결을 확인해 주세요." retry={() => { void query.refetch(); }} /> : !query.data.items.length ? <WardrobeState title="선택할 코디가 없어요" message="검색어를 바꾸거나 개별 의류로 기록해 보세요." /> : query.data.items.map((outfit) => {
      const unavailable = !outfit.outfit_items.length || outfit.outfit_items.length > maxWearItems || outfit.outfit_items.some((entry) => !entry.item || entry.item.deleted_at || entry.item.lifecycle_status !== 'active');
      return <Pressable key={outfit.id} accessibilityRole="button" accessibilityLabel={`${outfit.name} 기록할 코디로 선택${unavailable ? ', 현재 선택 불가' : ''}`} accessibilityState={{ selected: selected?.id === outfit.id, disabled: disabled || unavailable }} disabled={disabled || unavailable} onPress={() => onChoose({ id: outfit.id, version: outfit.updated_at, name: outfit.name, itemIds: outfit.outfit_items.map((entry) => entry.item_id).sort() })} style={{ gap: 6, minHeight: 56, padding: 14, borderWidth: 1, borderRadius: 10, borderColor: selected?.id === outfit.id ? colors.primary : colors.border, opacity: unavailable ? 0.5 : 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{outfit.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{outfit.outfit_items.length}벌{unavailable ? ' · 옷 상태를 확인해 주세요' : ''}</Text>
      </Pressable>;
    })}
    {query.data && query.data.total > outfitPageSize && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <ActionButton variant="secondary" label="코디 이전" disabled={disabled || state.page === 0 || query.isFetching} onPress={() => setState({ ...state, page: state.page - 1 })} />
      <Text style={{ color: colors.muted }}>{state.page + 1} / {last + 1}</Text>
      <ActionButton variant="secondary" label="코디 다음" disabled={disabled || state.page === last || query.isFetching} onPress={() => setState({ ...state, page: state.page + 1 })} />
    </View>}
  </View>;
}

export function WearItemPicker({ selected, disabled, onToggle }: { selected: string[]; disabled: boolean; onToggle: (id: string) => void }) {
  const colors = useTheme(); const categories = useCategories();
  const [text, setText] = useState('');
  const [state, setState] = useState({ page: 0, filters: { ...defaultFilters, status: 'active' as const } });
  useEffect(() => { const timer = setTimeout(() => setState((previous) => previous.filters.search === text.trim() ? previous : { page: 0, filters: { ...previous.filters, search: text.trim() } }), 350); return () => clearTimeout(timer); }, [text]);
  const query = useWardrobeList(state.page, state.filters);
  const ids = query.data?.items.map((item) => item.id) ?? [];
  const photos = usePhotos(ids);
  const last = query.data ? Math.max(0, Math.ceil(query.data.total / wardrobePageSize) - 1) : state.page;
  if (state.page > last) setState({ ...state, page: last });
  return <View style={{ gap: 12 }}>
    <SearchField label="기록할 의류 검색" placeholder="이름 · 브랜드 · 색상" value={text} onChange={setText} />
    <SelectField label="기록할 옷 종류" value={state.filters.category} disabled={disabled || categories.isPending || categories.isError} options={[{ value: '', label: '모든 종류' }, ...(categories.data ?? []).filter((category) => category.is_active).map((category) => ({ value: category.slug, label: `${category.parent_slug ? '· ' : ''}${category.label_ko}` }))]} onChange={(category) => setState({ page: 0, filters: { ...state.filters, category } })} />
    <Choice label="즐겨찾기 의류만" selected={state.filters.favoriteOnly} disabled={disabled} onPress={() => setState({ page: 0, filters: { ...state.filters, favoriteOnly: !state.filters.favoriteOnly } })} />
    <Text style={{ color: colors.muted }}>{selected.length} / {maxWearItems}벌 선택 · 선택한 옷은 아래 구성에서 제거할 수 있어요.</Text>
    <ActionButton variant="secondary" label="의류 목록 새로고침" disabled={disabled || query.isFetching} onPress={() => { void Promise.all([query.refetch(), photos.refetch(), categories.refetch()]); }} />
    {query.isPending ? <WardrobeState title="옷을 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="옷을 불러오지 못했어요" message="연결을 확인해 주세요." retry={() => { void query.refetch(); }} /> : !query.data.items.length ? <WardrobeState title="선택할 옷이 없어요" message="검색어나 종류를 바꿔 보세요. 보유 중인 옷만 선택할 수 있어요." /> : query.data.items.map((item) => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={`${item.name} 착용 기록에 선택`} accessibilityState={{ checked: selected.includes(item.id), disabled: disabled || (!selected.includes(item.id) && selected.length >= maxWearItems) }} disabled={disabled || (!selected.includes(item.id) && selected.length >= maxWearItems)} onPress={() => onToggle(item.id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 64, padding: 10, borderWidth: 1, borderRadius: 10, borderColor: selected.includes(item.id) ? colors.primary : colors.border }}>
      <View style={{ width: 52 }}><PhotoFrame photo={primaryPhoto(photos.data ?? [], item.id)} loading={photos.isPending} error={photos.isError} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ color: colors.text }} numberOfLines={2}>{item.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.brand_name || '브랜드 미입력'}</Text></View><Text style={{ color: colors.primary }}>{selected.includes(item.id) ? '✓' : '＋'}</Text>
    </Pressable>)}
    {query.data && query.data.total > wardrobePageSize && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <ActionButton variant="secondary" label="의류 이전" disabled={disabled || state.page === 0 || query.isFetching} onPress={() => setState({ ...state, page: state.page - 1 })} /><Text style={{ color: colors.muted }}>{state.page + 1} / {last + 1}</Text><ActionButton variant="secondary" label="의류 다음" disabled={disabled || state.page === last || query.isFetching} onPress={() => setState({ ...state, page: state.page + 1 })} />
    </View>}
  </View>;
}
