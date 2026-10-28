import { useState } from 'react';
import { Link } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { useTheme } from '@/theme/useTheme';
import { brandErrorMessage, filterBrands } from './model';
import { useBrandImages, useBrands } from './hooks';
import { BrandLogo } from './BrandLogo';

export function BrandPicker({ value, legacyName, onChange, disabled, error }: { value: string; legacyName: string; onChange: (id: string, name: string) => void; disabled?: boolean; error?: string | undefined }) {
  const colors = useTheme();
  const query = useBrands();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const selected = query.data?.find((brand) => brand.id === value);
  const results = filterBrands(query.data ?? [], search);
  const rows = results.slice(page * 20, (page + 1) * 20);
  const images = useBrandImages(open ? rows : selected ? [selected] : []);
  const label = selected?.name || legacyName || (value ? '브랜드 확인 필요' : '브랜드 선택 안 함');
  function close() { setOpen(false); }
  return <View style={{ gap: 8 }}>
    <Text style={{ color: colors.text, fontWeight: '600' }}>브랜드</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`브랜드 선택: ${label}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setSearch(''); setPage(0); setOpen(true); }} style={{ minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BrandLogo name={label} url={selected?.image_path ? images.data?.[selected.image_path] : undefined} size={36} /><Text style={{ flex: 1, color: colors.text }}>{label}</Text><Text style={{ color: colors.muted }}>선택 ▾</Text>
    </Pressable>
    {error && <Text accessibilityRole="alert" style={{ color: '#A52727' }}>{error}</Text>}
    <Link href="/brands" style={{ color: colors.primary, paddingVertical: 8 }}>브랜드 등록·관리</Link>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 20, justifyContent: 'center' }}>
        <View accessibilityViewIsModal style={{ maxHeight: '85%', width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: colors.background, padding: 20, borderRadius: 16, gap: 14 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>브랜드 선택</Text>
          <FormField label="브랜드 검색" value={search} maxLength={120} onChangeText={(text) => { setSearch(text); setPage(0); }} />
          <ActionButton variant="secondary" label="브랜드 선택 안 함" onPress={() => { onChange('', ''); close(); }} />
          {query.isPending ? <Text style={{ color: colors.muted }}>브랜드를 불러오는 중…</Text> : query.isError ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: colors.muted }}>{brandErrorMessage(query.error)}</Text><ActionButton label="다시 불러오기" onPress={() => { void query.refetch(); }} /></View> : <>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8 }}>
              {rows.map((brand) => <Pressable key={brand.id} accessibilityRole="radio" accessibilityState={{ checked: value === brand.id }} onPress={() => { onChange(brand.id, brand.name); close(); }} style={{ minHeight: 56, padding: 8, gap: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: value === brand.id ? colors.primary : colors.border, borderRadius: 8 }}><BrandLogo name={brand.name} url={brand.image_path ? images.data?.[brand.image_path] : undefined} /><Text style={{ flex: 1, color: colors.text }}>{brand.name}</Text>{value === brand.id && <Text style={{ color: colors.primary }}>✓</Text>}</Pressable>)}
              {rows.length === 0 && <Text style={{ color: colors.muted, padding: 12 }}>{query.data.length === 0 ? '등록한 브랜드가 없습니다. 브랜드 등록·관리에서 먼저 추가해 주세요.' : '검색 결과가 없습니다.'}</Text>}
            </ScrollView>
            {results.length > 20 && <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><ActionButton variant="secondary" label="이전" disabled={page === 0} onPress={() => setPage((value) => value - 1)} /><Text style={{ color: colors.muted }}>{page + 1} / {Math.ceil(results.length / 20)}</Text><ActionButton variant="secondary" label="다음" disabled={(page + 1) * 20 >= results.length} onPress={() => setPage((value) => value + 1)} /></View>}
          </>}
          <ActionButton variant="secondary" label="선택 닫기" onPress={close} />
        </View>
      </View>
    </Modal>
  </View>;
}
