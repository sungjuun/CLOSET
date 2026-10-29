import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { SearchField } from '@/components/ui/SearchField';
import { SelectField } from '@/components/ui/SelectField';
import { ActionButton } from '@/components/ui/ActionButton';
import { supabase } from '@/lib/supabase/client';
import { useUserId } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { WardrobeHeader, WardrobeState } from '../wardrobe/components';
import { seasons, seasonLabels } from '../wardrobe/types';
import { usePhotos } from '../wardrobe/photos/hooks';
import { changeOutfitFilters, createOutfitCatalog, defaultOutfitCatalogFilters, hasOutfitFilters, outfitCatalogKeys, outfitPageSize, outfitSearchText, type OutfitCatalogFilters, type OutfitCatalogPage, type SavedOutfit } from './catalog';
import { useOutfitActions } from './queries';
import { outfitErrorCode, outfitErrorMessage } from './repository';
import { OutfitCatalogCard, type RenameResult } from './CatalogCard';
import { useAccountPreferences } from '@/features/settings/AccountPreferencesProvider';
import { preferenceColumns } from '@/features/settings/preferences';

export function OutfitCatalogScreen() {
  const colors = useTheme();
  const owner = useUserId()!;
  const cache = useQueryClient();
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const [search, setSearch] = useState('');
  const [state, setState] = useState({ page: 0, filters: defaultOutfitCatalogFilters });
  const [deleteTarget, setDeleteTarget] = useState<Pick<SavedOutfit, 'id' | 'name' | 'updated_at'> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const writeLock = useRef(false);
  const actions = useOutfitActions();
  const { profile } = useAccountPreferences();
  const [sortOverride, setSortOverride] = useState<OutfitCatalogFilters['sort'] | null>(null);
  const { page } = state;
  const filters = { ...state.filters, sort: sortOverride ?? profile?.outfit_sort ?? defaultOutfitCatalogFilters.sort };
  const query = useQuery({ queryKey: outfitCatalogKeys.list(owner, page, filters), queryFn: ({ signal }) => createOutfitCatalog(supabase!, owner).list(page, filters, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
  const ids = [...new Set(query.data?.items.flatMap((outfit) => outfit.outfit_items.flatMap((entry) => entry.item && !entry.item.deleted_at ? [entry.item.id] : [])) ?? [])];
  const photos = usePhotos(ids);
  useEffect(() => { const text = outfitSearchText(search); const timer = setTimeout(() => setState((previous) => previous.filters.search === text ? previous : changeOutfitFilters(previous, { search: text })), 350); return () => clearTimeout(timer); }, [search]);
  const lastPage = query.data ? Math.max(0, Math.ceil(query.data.total / outfitPageSize) - 1) : page;
  if (page > lastPage) setState({ ...state, page: lastPage });
  function change(patch: Partial<OutfitCatalogFilters>) { if (patch.sort) setSortOverride(patch.sort); setState((previous) => changeOutfitFilters(previous, patch)); }
  function requestDelete(outfit: SavedOutfit) {
    if (writeLock.current) return;
    setDeleteTarget({ id: outfit.id, name: outfit.name, updated_at: outfit.updated_at });
    setDeleteError(null); setMessage(null);
  }
  function cancelDelete() {
    if (writeLock.current) return;
    setDeleteTarget(null); setDeleteError(null);
  }
  async function confirmDelete() {
    if (!deleteTarget || writeLock.current) return;
    writeLock.current = true; setDeleting(true); setDeleteError(null);
    try {
      const result = await actions.perform((repository, signal) => repository.remove(deleteTarget.id, deleteTarget.updated_at, signal));
      if (result) { setDeleteTarget(null); setMessage('코디를 삭제했어요.'); }
    } catch (error) {
      if (!actions.isActive()) return;
      const code = outfitErrorCode(error);
      if (code === '40001' || code === 'P0002') {
        setDeleteTarget(null);
        setMessage(code === '40001' ? '다른 곳에서 코디가 변경됐어요. 최신 목록을 확인한 뒤 다시 삭제해 주세요.' : '이미 삭제되었거나 접근할 수 없는 코디예요. 목록을 다시 확인해 주세요.');
      } else setDeleteError(outfitErrorMessage(error));
    } finally { writeLock.current = false; if (actions.isActive()) setDeleting(false); }
  }
  async function rename(id: string, expected: string, name: string): Promise<RenameResult> {
    if (writeLock.current) return { status: 'cancelled' };
    writeLock.current = true; setSavingId(id); setMessage(null);
    try {
      const result = await actions.perform((repository, signal) => repository.rename(id, expected, name, signal));
      if (!result) return { status: 'cancelled' };
      cache.setQueryData<OutfitCatalogPage>(outfitCatalogKeys.list(owner, page, filters), (previous) => previous && ({ ...previous, items: previous.items.map((outfit) => outfit.id === id ? { ...outfit, ...result.value } : outfit) }));
      return { status: 'saved' };
    } catch (error) {
      if (!actions.isActive()) return { status: 'cancelled' };
      return { status: 'error', message: outfitErrorCode(error) === '40001' ? '다른 곳에서 코디가 변경됐어요. 이름 수정 취소를 눌러 최신 내용을 확인한 뒤 다시 저장해 주세요.' : outfitErrorMessage(error) };
    } finally { writeLock.current = false; if (actions.isActive()) setSavingId(null); }
  }
  const filtered = hasOutfitFilters(filters);
  const busy = deleting || savingId !== null;
  const columns = preferenceColumns('outfits', width, profile?.card_density ?? 'standard');
  return <View style={{ gap: 24 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><WardrobeHeader title="저장한 코디" description="마음에 들었던 조합을 다시 꺼내 보세요." /></View><Link href="/outfits/new" asChild><Pressable accessibilityRole="button" accessibilityLabel="새 코디" style={{ backgroundColor: colors.primary, borderRadius: 7, minHeight: 42, paddingHorizontal: 16, gap: 7, flexDirection: 'row', alignItems: 'center' }}><Icon name="plus" color={colors.onPrimary} size={16} /><Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '700' }}>새 코디</Text></Pressable></Link></View>
    <View style={{ gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}><View style={{ width: '100%', maxWidth: 400 }}><SearchField label="코디 검색" placeholder="코디 이름·브랜드·메모·#태그 검색" value={search} onChange={setSearch} onSubmit={() => change({ search: outfitSearchText(search) })} /></View><Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{query.data?.total ?? '—'}</Text>개의 목록 / 전체 {query.data?.allTotal ?? '—'}개</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>{(['', ...seasons] as const).map((season) => <Pressable key={season} accessibilityRole="button" aria-pressed={filters.season === season} onPress={() => change({ season })} style={{ minHeight: 32, minWidth: 40, paddingHorizontal: 10, borderWidth: 1, borderRadius: 6, justifyContent: 'center', borderColor: filters.season === season ? colors.primary : colors.border, backgroundColor: filters.season === season ? colors.surface : colors.background }}><Text style={{ color: filters.season === season ? colors.primary : colors.text, fontSize: 12 }}>{season ? seasonLabels[season] : '전체'}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="코디 필터 초기화" onPress={() => { setSearch(''); setSortOverride(null); setState({ page: 0, filters: defaultOutfitCatalogFilters }); }} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}><Icon name="refresh" size={14} color={colors.text} /><Text style={{ color: colors.text, fontSize: 12 }}>필터 초기화</Text></Pressable></View>
        <View style={{ width: 138 }}><SelectField compact hideLabel label="코디 정렬" value={filters.sort} options={[{ value: 'recent', label: '최근 추가순' }, { value: 'updated', label: '최근 수정순' }, { value: 'oldest', label: '오래된 추가순' }, { value: 'name', label: '이름순' }]} onChange={(value) => change({ sort: value as OutfitCatalogFilters['sort'] })} /></View>
      </View>
    </View>
    {message && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 13, lineHeight: 22 }}>{message}</Text>}
    {query.isPending ? <WardrobeState title="코디를 불러오는 중" message="저장한 조합을 준비하고 있어요." /> : query.isError ? <WardrobeState title="코디를 불러오지 못했어요" message="연결을 확인하고 다시 시도해 주세요." retry={() => { void query.refetch(); }} /> : query.data.items.length === 0 ? <WardrobeState title={filtered ? '조건에 맞는 코디가 없어요' : '아직 저장한 코디가 없어요'} message={filtered ? '검색어나 계절 조건을 바꿔 보세요.' : '새 코디에서 내 옷으로 조합을 만들어 보세요.'} /> : <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 }}>{gridWidth > 0 && query.data.items.map((outfit, index) => <View key={outfit.id} style={{ width: (gridWidth - 24 * (columns - 1)) / columns }}><OutfitCatalogCard outfit={outfit} number={page * outfitPageSize + index + 1} photos={photos.data ?? []} photoPending={photos.isPending} photoError={photos.isError} busy={busy} saving={savingId === outfit.id} onDelete={requestDelete} onRename={rename} /></View>)}</View>}
    {query.data && query.data.total > outfitPageSize && <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}><ActionButton variant="secondary" label="코디 이전 페이지" disabled={page === 0 || query.isFetching} onPress={() => setState({ ...state, page: page - 1 })} /><Text style={{ color: colors.muted }}>{page + 1} / {lastPage + 1}</Text><ActionButton variant="secondary" label="코디 다음 페이지" disabled={page === lastPage || query.isFetching} onPress={() => setState({ ...state, page: page + 1 })} /></View>}
    <Modal visible={deleteTarget !== null} transparent animationType="fade" onRequestClose={cancelDelete}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, justifyContent: 'center' }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 380, alignSelf: 'center', backgroundColor: colors.background, borderRadius: 14, padding: 20, gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>코디를 삭제할까요?</Text>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{deleteTarget?.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>저장한 코디 목록에서 제거합니다. 옷과 과거 착용 기록은 유지됩니다.</Text>
          {deleteError && <Text accessibilityRole="alert" style={{ color: '#A52727', fontSize: 13, lineHeight: 22 }}>{deleteError}</Text>}
          <View style={{ gap: 8 }}>
            <ActionButton label="코디 삭제" loading={deleting} onPress={() => { void confirmDelete(); }} />
            <ActionButton variant="secondary" label="취소" disabled={deleting} onPress={cancelDelete} />
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}
