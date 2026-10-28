import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { SelectField } from '@/components/ui/SelectField';
import { Icon } from '@/components/ui/Icon';
import { wardrobeColumns } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { useCategories, useWardrobeFilterOptions, useWardrobeList } from './queries';
import { WardrobeFilterBar } from './FilterBar';
import { changeFilters, defaultFilters, hasFilters, sortOptions, type ListState, type WardrobeFilters } from './filters';
import { WardrobeHeader, WardrobeState } from './components';
import { usePhotos } from './photos/hooks';
import { primaryPhoto } from './photos/model';
import { PhotoFrame } from './photos/PhotoFrame';
import { wardrobeErrorMessage } from './errors';
import { lifecycleLabels, wardrobePageSize } from './types';
import { FavoriteButton } from './FavoriteButton';
import { useBrands, useBrandImages } from '@/features/brands/hooks';
import { BrandLogo } from '@/features/brands/BrandLogo';

export function WardrobeListScreen() {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 768;
  const [state, setState] = useState<ListState>({ page: 0, filters: defaultFilters });
  const { page, filters } = state;
  const [search, setSearch] = useState('');
  const [gridWidth, setGridWidth] = useState(0);
  const query = useWardrobeList(page, filters);
  const categories = useCategories();
  const options = useWardrobeFilterOptions();
  const brands = useBrands();
  const visibleBrands = (brands.data ?? []).filter((brand) => query.data?.items.some((item) => item.brand_id === brand.id));
  const brandImages = useBrandImages(visibleBrands);
  const photos = usePhotos(query.data?.items.map((item) => item.id) ?? []);
  const columns = wardrobeColumns(width);
  const gap = mobile ? 12 : 20;
  useEffect(() => {
    const timer = setTimeout(() => setState((previous) => previous.filters.search === search.trim() ? previous : changeFilters(previous, { search })), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const lastPage = query.data ? Math.max(0, Math.ceil(query.data.total / wardrobePageSize) - 1) : page;
  if (page > lastPage) setState({ ...state, page: lastPage });
  function update(patch: Partial<WardrobeFilters>) { setState((previous) => changeFilters(previous, patch)); }
  function reset() { setSearch(''); setState({ page: 0, filters: defaultFilters }); }
  const filtered = hasFilters(filters);
  return <View style={{ gap: 28 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}><WardrobeHeader title="내 옷장" description="내가 가진 옷, 한눈에." /></View>
      <Link href="/wardrobe/new" asChild><Pressable accessibilityRole="button" accessibilityLabel="옷 추가" style={{ backgroundColor: colors.primary, paddingHorizontal: mobile ? 15 : 18, minHeight: 42, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name="plus" size={17} color={colors.onPrimary} /><Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '700' }}>옷 추가</Text></Pressable></Link>
    </View>
    <WardrobeFilterBar filters={filters} search={search} onSearch={setSearch} onChange={update} onReset={reset} categories={categories.data ?? []} brands={options.data?.brands ?? []} colors={options.data?.colors ?? []} loadingCategories={categories.isPending || categories.isError} loadingOptions={options.isPending || options.isError} />
    {(categories.isError || options.isError) && <WardrobeState title="일부 필터를 불러오지 못했어요" message="선택한 검색 조건은 유지됩니다. 연결을 확인한 뒤 다시 시도해 주세요." retry={() => { void Promise.all([categories.refetch(), options.refetch()]); }} />}
    <View style={{ gap: mobile ? 18 : 16, marginTop: mobile ? -14 : -28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13 }}><Text style={{ color: colors.text, fontWeight: '800' }}>{query.data?.total ?? '—'}</Text> 개의 아이템{filtered ? ' · 검색 결과' : ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="옷장 새로고침" disabled={query.isFetching} onPress={() => { void Promise.all([query.refetch(), options.refetch(), photos.refetch()]); }} style={{ minWidth: 36, minHeight: mobile ? 44 : 36, alignItems: 'center', justifyContent: 'center', opacity: query.isFetching ? 0.4 : 1 }}><Icon name="refresh" size={14} color={colors.muted} /></Pressable>
          <View style={{ width: mobile ? 120 : 154 }}><SelectField compact hideLabel borderless label="정렬" value={filters.sort} options={sortOptions} onChange={(sort) => update({ sort: sort as WardrobeFilters['sort'] })} /></View>
        </View>
      </View>
      {filters.sort.startsWith('price_') && <Text style={{ color: colors.muted, fontSize: 12 }}>통화 코드순으로 묶어 같은 통화 안에서 가격을 비교합니다. 가격 미입력은 마지막에 표시합니다.</Text>}
      {query.isPending ? <WardrobeState title="옷장을 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="옷장을 불러오지 못했어요" message={wardrobeErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <>
        {query.data.items.length === 0 && <WardrobeState title={filtered ? '조건에 맞는 옷이 없어요' : '첫 번째 옷을 등록해 보세요'} message={filtered ? '검색어나 필터를 바꿔 보세요. 필터 초기화로 전체 옷장을 볼 수 있어요.' : '제품명과 옷 종류만 입력하면 내 옷장에 보관할 수 있어요.'} />}
        <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap, rowGap: 26, width: '100%' }}>
          {gridWidth > 0 && query.data.items.map((item) => {
            const category = categories.data?.find((entry) => entry.slug === item.category_slug);
            const parent = categories.data?.find((entry) => entry.slug === category?.parent_slug);
            return <View key={item.id} style={{ width: (gridWidth - gap * (columns - 1)) / columns }}>
              <Link href={{ pathname: '/wardrobe/[itemId]', params: { itemId: item.id } }} asChild><Pressable accessibilityRole="link" accessibilityLabel={`${item.name} 상세 보기`} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                <PhotoFrame catalog photo={primaryPhoto(photos.data ?? [], item.id)} loading={photos.isPending} error={photos.isError} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, marginBottom: 8 }}>
                  <BrandLogo name={item.brand_name ?? ''} url={(() => { const brand = visibleBrands.find((entry) => entry.id === item.brand_id); return brand?.image_path ? brandImages.data?.[brand.image_path] : undefined; })()} size={28} />
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontSize: mobile ? 12 : 11 }}>{item.brand_name || '브랜드 미입력'}</Text>
                </View>
                <Text numberOfLines={2} style={{ color: colors.text, fontSize: mobile ? 16 : 14, lineHeight: mobile ? 23 : 21, fontWeight: '700', letterSpacing: -0.4 }}>{item.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 5 }}>
                  <Text numberOfLines={1} style={{ maxWidth: '100%', color: colors.muted, fontSize: 11, lineHeight: 17 }}>{parent ? `${parent.label_ko} · ` : ''}{category?.label_ko ?? '분류'}</Text>
                  {item.color_name && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color_hex || colors.muted }} /><Text style={{ color: colors.muted, fontSize: 11 }}>{item.color_name}</Text></View>}
                </View>
                {filters.sort.startsWith('price_') && <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{item.purchase_price === null ? '구매가 미입력' : `${item.currency} ${item.purchase_price.toLocaleString('ko-KR')}`}</Text>}
                {item.lifecycle_status !== 'active' && <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{lifecycleLabels[item.lifecycle_status] ?? '상태 확인 필요'}</Text>}
              </Pressable></Link>
              <View style={{ position: 'absolute', top: 5, right: 5 }}><FavoriteButton item={item} compact /></View>
            </View>;
          })}
        </View>
        {(page > 0 || query.data.total > wardrobePageSize) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 8 }}><ActionButton variant="secondary" label="이전 페이지" disabled={page === 0 || query.isFetching} onPress={() => setState((previous) => ({ ...previous, page: Math.max(0, previous.page - 1) }))} /><Text style={{ color: colors.muted, fontSize: 13 }}>{page + 1} / {Math.max(1, Math.ceil(query.data.total / wardrobePageSize))}</Text><ActionButton variant="secondary" label="다음 페이지" disabled={(page + 1) * wardrobePageSize >= query.data.total || query.isFetching} onPress={() => setState((previous) => ({ ...previous, page: previous.page + 1 }))} /></View>}
      </>}
    </View>
  </View>;
}
