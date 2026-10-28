import { Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { useCategories, useWardrobeActions, useWardrobeItem } from './queries';
import { WardrobeBackLink, WardrobeState } from './components';
import { PhotoManager } from './photos/PhotoManager';
import { lifecycleLabels, seasonLabels } from './types';
import { wardrobeErrorMessage } from './errors';
import { WardrobeManageControls } from './ManageControls';
import { useBrands, useBrandImages } from '@/features/brands/hooks';
import { BrandLogo } from '@/features/brands/BrandLogo';

export function WardrobeDetailScreen({ id }: { id: string }) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const query = useWardrobeItem(id);
  const actions = useWardrobeActions();
  const categories = useCategories();
  const item = query.data;
  const brands = useBrands();
  const brand = brands.data?.find((entry) => entry.id === item?.brand_id);
  const brandImages = useBrandImages(brand ? [brand] : []);
  const category = categories.data?.find((value) => value.slug === item?.category_slug);
  const parent = category?.parent_slug ? categories.data?.find((value) => value.slug === category.parent_slug) : null;
  const price = item?.purchase_price === null || item?.purchase_price === undefined ? '미입력' : new Intl.NumberFormat('ko-KR', { style: 'currency', currency: item.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(item.purchase_price);
  const entries = item ? [
    ['분류', category ? `${parent ? `${parent.label_ko} › ` : ''}${category.label_ko}` : '분류 정보 확인 중'],
    ['색상', item.color_name || '미입력'], ['색상 코드', item.color_hex || '미입력'],
    ['사이즈', item.size_label || '미입력'], ['소재', item.material || '미입력'],
    ['계절', item.seasons.map((season) => seasonLabels[season as keyof typeof seasonLabels] ?? season).join(' · ') || '미입력'],
    ['상태', lifecycleLabels[item.lifecycle_status] ?? '확인 필요'], ['구매 가격', price],
    ['구매일', item.purchased_on || '미입력'], ['구매처 링크', item.purchase_url || '미입력'],
    ['태그', item.tags.join(', ') || '미입력'], ['메모', item.notes || '미입력'],
  ] : [];
  return <View style={{ gap: 24 }}>
    <WardrobeBackLink />
    {query.isPending ? <WardrobeState title="옷 정보를 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="옷 정보를 불러오지 못했어요" message={wardrobeErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : !item ? <WardrobeState title="옷을 찾을 수 없어요" message="삭제되었거나 접근할 수 없는 항목입니다. 내 옷장에서 다시 확인해 주세요." /> : <View style={{ flexDirection: width >= 1024 ? 'row' : 'column', gap: 32, alignItems: 'flex-start' }}>
      <View style={{ width: width >= 1024 ? '38%' : '100%', maxWidth: 480 }}><PhotoManager itemId={item.id} canUpload={item.lifecycle_status === 'active'} /></View>
      <View style={{ flex: 1, width: '100%', minWidth: 0, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><BrandLogo name={item.brand_name ?? ''} url={brand?.image_path ? brandImages.data?.[brand.image_path] : undefined} /><Text style={{ color: colors.muted, fontSize: 15 }}>{item.brand_name || '브랜드 미입력'}</Text></View>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, lineHeight: 38, fontWeight: '700' }}>{item.name}</Text>
        <WardrobeManageControls item={item} actions={actions} />
        {entries.map(([label, value]) => <View key={label} style={{ gap: 8, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 16 }}><Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text><Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 24 }}>{value}</Text></View>)}
      </View>
    </View>}
  </View>;
}
