import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/useTheme';
import { bodyDraft, brandSizeSchema, MeasurementInputError, measurementGroups, parseBodyDraft, type BodyDraft, type BodyMeasurements, type BrandSize, type BrandSizeDraft, type MeasurementGroupKey } from './model';
import { BrandSizeDetails, MeasurementSummary, SizeDialog } from './SizeDetails';
import { sizeErrorMessage, type SizeChange } from './service';
import { useSizes } from './useSizes';

type Editor =
  | { kind: 'body'; base: BodyMeasurements | null; draft: BodyDraft; group: MeasurementGroupKey }
  | { kind: 'brand'; id: string; base: BrandSize | null; draft: BrandSizeDraft }
  | { kind: 'remove'; base: BrandSize };

const brandFields = [
  { key: 'brand_name', label: '브랜드명 *', placeholder: '예: 유니클로', maxLength: 120 },
  { key: 'garment_type', label: '옷 종류 *', placeholder: '예: 티셔츠', maxLength: 80 },
  { key: 'size_label', label: '착용 사이즈 *', placeholder: '예: M, 32, 270', maxLength: 60 },
  { key: 'fit_note', label: '착용감 메모', placeholder: '예: 어깨가 맞고 품은 여유 있음', maxLength: 200 },
] as const;

export function SizeManagement() {
  const colors = useTheme();
  const { key, query, service } = useSizes();
  const cache = useQueryClient();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { currentRequest.current?.abort(); currentRequest.current = null; };
  }, []);

  function open(next: Editor) {
    setError(null);
    setNotice(null);
    setEditor(next);
  }

  function editBrand(base: BrandSize | null) {
    const draft = {
      brand_name: base?.brand_name ?? '', garment_type: base?.garment_type ?? '',
      size_label: base?.size_label ?? '', fit_note: base?.fit_note ?? '',
    };
    open({ kind: 'brand', id: base?.id ?? randomUUID(), base, draft });
  }

  async function submit() {
    if (!editor || currentRequest.current) return;
    let change: SizeChange;
    if (editor.kind === 'body') {
      try { change = { kind: 'body', base: editor.base, values: parseBodyDraft(editor.draft) }; }
      catch (cause) {
        if (cause instanceof MeasurementInputError) setEditor({ ...editor, group: cause.group });
        setError(cause instanceof Error ? cause.message : '치수를 확인해 주세요.');
        return;
      }
    } else if (editor.kind === 'brand') {
      const parsed = brandSizeSchema.safeParse(editor.draft);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? '사이즈 기록을 확인해 주세요.'); return; }
      change = { kind: 'brand', id: editor.id, base: editor.base, values: parsed.data };
    } else {
      change = editor;
    }

    const controller = new AbortController();
    currentRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setError(null);
    setSaving(true);
    try {
      await service.save(change, controller.signal);
      if (currentRequest.current !== controller) return;
      setEditor(null);
      setNotice(change.kind === 'remove' ? '사이즈 기록을 삭제했어요.' : '사이즈를 저장했어요.');
    } catch (cause) {
      if (currentRequest.current === controller) setError(sizeErrorMessage(cause));
    } finally {
      clearTimeout(timeout);
      if (currentRequest.current === controller) {
        // A response can be lost after the database has committed the change.
        await cache.invalidateQueries({ queryKey: key });
        if (currentRequest.current === controller) {
          currentRequest.current = null;
          setSaving(false);
        }
      }
    }
  }

  if (!query.data) return <View style={{ gap: 12 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{query.isError ? '저장한 사이즈를 불러오지 못했어요.' : '내 사이즈를 불러오는 중이에요.'}</Text>
    {query.isError && <ActionButton variant="secondary" label="다시 불러오기" onPress={() => { void query.refetch(); }} />}
  </View>;

  const { body, brands } = query.data;
  const bodyGroup = editor?.kind === 'body' ? measurementGroups.find(({ key }) => key === editor.group) : undefined;
  const panel = { padding: 20, gap: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background };
  const heading = { fontSize: 16, fontWeight: '700' as const, color: colors.text };
  return <View style={{ gap: 20 }}>
    {notice && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary }}>{notice}</Text>}
    {query.isError && <View style={{ gap: 8 }}>
      <Text accessibilityRole="alert" style={{ color: colors.danger }}>최신 사이즈를 불러오지 못했어요.</Text>
      <ActionButton variant="secondary" label="다시 불러오기" onPress={() => { void query.refetch(); }} />
    </View>}
    <View style={panel}>
      <Text accessibilityRole="header" aria-level={3} style={heading}>내 신체 치수</Text>
      <MeasurementSummary body={body} />
      <View style={{ alignSelf: 'flex-start' }}>
        <ActionButton variant="secondary" label="치수 편집" disabled={saving} onPress={() => open({ kind: 'body', base: body, draft: bodyDraft(body), group: 'basic' })} />
      </View>
    </View>
    <View style={panel}>
      <Text accessibilityRole="header" aria-level={3} style={heading}>브랜드별 사이즈</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>잘 맞았던 사이즈와 착용감을 옷 종류별로 기록해 두세요.</Text>
      <View style={{ alignSelf: 'flex-start' }}>
        <ActionButton variant="secondary" label="사이즈 추가" disabled={saving} onPress={() => editBrand(null)} />
      </View>
      {brands.length === 0 && <Text style={{ color: colors.muted }}>아직 저장한 브랜드별 사이즈가 없어요.</Text>}
      {brands.map((record) => <View key={record.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
        <BrandSizeDetails record={record} />
        <IconButton icon="pencil" label={`${record.brand_name} ${record.garment_type} ${record.size_label} 사이즈 수정`} disabled={saving} onPress={() => editBrand(record)} />
        <IconButton icon="trash" label={`${record.brand_name} ${record.garment_type} ${record.size_label} 사이즈 삭제`} disabled={saving} onPress={() => open({ kind: 'remove', base: record })} />
      </View>)}
    </View>
    {editor && <SizeDialog title={editor.kind === 'body' ? '신체 치수 편집' : editor.kind === 'remove' ? '사이즈 기록을 삭제할까요?' : editor.base ? '사이즈 수정' : '사이즈 추가'} busy={saving} onClose={() => setEditor(null)}>
      {editor.kind === 'body' && bodyGroup && <>
        <View accessibilityRole="tablist" accessibilityLabel="치수 분류" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {measurementGroups.map(({ key, label }) => {
            const selected = editor.group === key;
            return <Pressable key={key} accessibilityRole="tab" aria-selected={selected} accessibilityState={{ selected, disabled: saving }} disabled={saving}
              onPress={() => setEditor({ ...editor, group: key })}
              style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderRadius: 8, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.surface : colors.background }}>
              <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: selected ? '700' : '400' }}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>분류별로 알고 있는 치수만 입력하고, 마지막에 한 번 저장하세요. 값을 지우고 저장하면 해당 치수가 비워져요.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {bodyGroup.fields.map(({ key, label }) => <View key={key} style={{ flexBasis: '45%', flexGrow: 1, minWidth: 116 }}>
            <FormField label={`${label} (${bodyGroup.unit})`} value={editor.draft[key]} maxLength={6} keyboardType={bodyGroup.unit === 'mm' ? 'number-pad' : 'decimal-pad'} editable={!saving}
              onChangeText={(value) => { setError(null); setEditor({ ...editor, draft: { ...editor.draft, [key]: value } }); }} />
          </View>)}
        </View>
      </>}
      {editor.kind === 'brand' && brandFields.map(({ key, label, placeholder, maxLength }) => <FormField key={key} label={label} placeholder={placeholder} maxLength={maxLength} value={editor.draft[key]} editable={!saving}
        onChangeText={(value) => setEditor({ ...editor, draft: { ...editor.draft, [key]: value } })} />)}
      {editor.kind === 'remove' && <View style={{ flexDirection: 'row' }}><BrandSizeDetails record={editor.base} /></View>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 20 }}>{error}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ActionButton variant="secondary" label="취소" disabled={saving} onPress={() => setEditor(null)} />
        <ActionButton label={editor.kind === 'remove' ? '사이즈 삭제' : '저장'} loading={saving} onPress={() => { void submit(); }} />
      </View>
    </SizeDialog>}
  </View>;
}
