import type { PropsWithChildren } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/useTheme';
import { measurementGroups, type BodyMeasurements, type BrandSize } from './model';

export function SizeDialog({ title, onClose, busy, children }: PropsWithChildren<{ title: string; onClose: () => void; busy?: boolean }>) {
  const colors = useTheme();
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 520, maxHeight: '88%', alignSelf: 'center', backgroundColor: colors.background, borderRadius: 14, padding: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text accessibilityRole="header" style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' }}>{title}</Text>
          <IconButton icon="close" label="닫기" disabled={Boolean(busy)} onPress={onClose} />
        </View>
        <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 4 }}>
          {children}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

export function MeasurementSummary({ body }: { body: BodyMeasurements | null }) {
  const colors = useTheme();
  if (!body) return <Text style={{ color: colors.muted, lineHeight: 20 }}>아직 저장한 치수가 없어요.</Text>;
  const saved = measurementGroups.map((group) => ({
    ...group,
    fields: group.fields.filter(({ key }) => body[key] != null),
  })).filter(({ fields }) => fields.length > 0);
  if (saved.length === 0) return <Text style={{ color: colors.muted, lineHeight: 20 }}>아직 저장한 치수가 없어요.</Text>;

  return <View style={{ gap: 14 }}>
    {saved.map(({ key, label, unit, fields }) => <View key={key} style={{ gap: 7 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {fields.map((field) => <View key={field.key} style={{ minWidth: 95, gap: 5, padding: 12, backgroundColor: colors.surface, borderRadius: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{body[field.key]} {unit}</Text>
        </View>)}
      </View>
    </View>)}
  </View>;
}

export function BrandSizeDetails({ record }: { record: BrandSize }) {
  const colors = useTheme();
  return <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
    <Text style={{ color: colors.text, fontWeight: '700' }}>{record.brand_name} · {record.garment_type}</Text>
    <Text style={{ color: colors.primary, fontWeight: '700' }}>{record.size_label}</Text>
    {!!record.fit_note && <Text style={{ color: colors.muted, lineHeight: 20 }}>{record.fit_note}</Text>}
  </View>;
}
