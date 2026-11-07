import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/theme/useTheme';
import { prioritizeBrand } from './model';
import { BrandSizeDetails, MeasurementSummary, SizeDialog } from './SizeDetails';
import { useSizes } from './useSizes';

export function SizeReference({ brandName, disabled }: { brandName: string; disabled: boolean }) {
  const colors = useTheme();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(true)}
      style={{ minHeight: 48, paddingHorizontal: 10, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>내 사이즈 보기</Text>
    </Pressable>
    {open && <SizeReferenceDialog brandName={brandName} onClose={() => setOpen(false)} />}
  </>;
}

function SizeReferenceDialog({ brandName, onClose }: { brandName: string; onClose: () => void }) {
  const colors = useTheme();
  const { query } = useSizes();
  const records = prioritizeBrand(query.data?.brands ?? [], brandName);
  return <SizeDialog title="내 사이즈" onClose={onClose}>
    {query.isError ? <>
      <Text accessibilityRole="alert" style={{ color: colors.danger }}>사이즈를 불러오지 못했어요.</Text>
      <ActionButton variant="secondary" label="다시 불러오기" onPress={() => { void query.refetch(); }} />
    </> : query.isPending ? <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>사이즈를 불러오는 중이에요.</Text> : <>
      <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700' }}>내 신체 치수</Text>
      <MeasurementSummary body={query.data.body} />
      <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700' }}>브랜드별 사이즈</Text>
      {records.map((record) => <View key={record.id} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
        <BrandSizeDetails record={record} />
      </View>)}
      {!records.length && <Text style={{ color: colors.muted, lineHeight: 20 }}>설정 → 사이즈 관리에서 기록을 추가할 수 있어요.</Text>}
    </>}
  </SizeDialog>;
}
