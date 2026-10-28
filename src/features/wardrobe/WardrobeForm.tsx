import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { FormField } from '@/components/ui/FormField';
import { BrandPicker } from '@/features/brands/BrandPicker';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/theme/useTheme';
import { useCategories, useCreateWardrobeItem, useWardrobeActions } from './queries';
import { draftErrors, wardrobeDraftSchema, type DraftErrors } from './schemas';
import { emptyWardrobeDraft, seasons, seasonLabels, type WardrobeDraft, type WardrobeItem } from './types';
import { itemToDraft } from './editing';
import { wardrobeErrorMessage } from './errors';
import { Choice, WardrobeBackLink, WardrobeHeader, WardrobeState } from './components';

export function WardrobeForm({ initialItem, reload }: { initialItem?: WardrobeItem; reload?: () => Promise<WardrobeItem | null> }) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const categories = useCategories();
  const mutation = useCreateWardrobeItem();
  const actions = useWardrobeActions();
  const [base, setBase] = useState(initialItem ?? null);
  const [requestId] = useState(() => randomUUID());
  const [draft, setDraft] = useState(() => initialItem ? itemToDraft(initialItem) : emptyWardrobeDraft());
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<'cancel' | 'reload' | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const busy = useRef(false);
  const pending = saving || mutation.isPending;
  const dirty = JSON.stringify(draft) !== JSON.stringify(base ? itemToDraft(base) : emptyWardrobeDraft());
  const available = (categories.data ?? []).filter((category) => category.is_active && (!category.parent_slug || categories.data?.some((parent) => parent.slug === category.parent_slug && parent.is_active)));
  const selected = available.find((category) => category.slug === draft.category_slug);
  const parentSlug = selected?.parent_slug ?? selected?.slug;
  const roots = available.filter((category) => !category.parent_slug);
  const children = available.filter((category) => category.parent_slug === parentSlug);
  const fieldWidth = width >= 768 ? '48%' : '100%';
  function update<Key extends keyof WardrobeDraft>(key: Key, value: WardrobeDraft[Key]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setMessage(null);
  }
  async function submit() {
    if (busy.current) return;
    const parsed = wardrobeDraftSchema.safeParse(draft);
    const validation = parsed.success ? {} : draftErrors(parsed.error);
    if (!selected) validation.category_slug = '사용 가능한 옷 종류를 선택해 주세요.';
    setErrors(validation);
    if (!parsed.success || Object.values(validation).some(Boolean)) {
      setMessage('입력값을 확인해 주세요.');
      if (Object.keys(validation).some((key) => !['name', 'brand_name', 'category_slug', 'color_name', 'size_label'].includes(key))) setAdvanced(true);
      return;
    }
    busy.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const item = base ? await actions.perform((repository, signal) => repository.update(base.id, base.updated_at, parsed.data, signal)) : await mutation.mutateAsync({ id: requestId, input: parsed.data });
      if (item) router.replace({ pathname: '/wardrobe/[itemId]', params: { itemId: item.id } });
    } catch (cause) { if (actions.isActive()) setMessage(wardrobeErrorMessage(cause)); }
    finally { busy.current = false; if (actions.isActive()) setSaving(false); }
  }
  async function reloadLatest() {
    if (!reload || busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const latest = await reload();
      if (!actions.isActive()) return;
      if (!latest) { setUnavailable(true); setMessage('삭제되었거나 접근할 수 없는 옷입니다. 내 옷장과 휴지통에서 확인해 주세요.'); return; }
      setBase(latest); setDraft(itemToDraft(latest)); setErrors({}); setMessage(null); setConfirmation(null);
    } catch (cause) { if (actions.isActive()) setMessage(wardrobeErrorMessage(cause)); }
    finally { busy.current = false; if (actions.isActive()) setSaving(false); }
  }
  function cancel() {
    if (dirty) setConfirmation('cancel');
    else if (base) router.replace({ pathname: '/wardrobe/[itemId]', params: { itemId: base.id } });
  }
  return <View style={{ gap: 24, width: '100%', maxWidth: 960, alignSelf: 'center' }}>
    {base ? <ActionButton variant="secondary" label="수정 취소" disabled={pending} onPress={cancel} /> : <WardrobeBackLink />}
    <WardrobeHeader title={base ? '옷 정보 수정' : '옷 추가'} description={base ? '저장된 정보를 수정해 주세요. 다른 곳의 변경과 충돌하면 덮어쓰지 않고 알려드려요.' : '제품명과 옷 종류를 먼저 저장해 주세요. 상세 화면에서 사진을 최대 5장 추가할 수 있어요.'} />
    {confirmation && <View style={{ gap: 12, padding: 20, backgroundColor: colors.surface, borderRadius: 12 }}><Text style={{ color: colors.text }}>저장하지 않은 입력을 버리고 {confirmation === 'cancel' ? '상세 화면으로 돌아갈까요?' : '최신 저장 내용으로 교체할까요?'}</Text><ActionButton variant="secondary" label="계속 편집" disabled={pending} onPress={() => setConfirmation(null)} /><ActionButton label={confirmation === 'cancel' ? '수정 내용 버리기' : '최신 내용으로 교체'} disabled={pending} onPress={() => { if (confirmation === 'reload') void reloadLatest(); else if (base) router.replace({ pathname: '/wardrobe/[itemId]', params: { itemId: base.id } }); }} /></View>}
    {categories.isPending ? <WardrobeState title="분류를 불러오는 중" message="잠시만 기다려 주세요." /> : categories.isError ? <WardrobeState title="분류를 불러오지 못했어요" message={wardrobeErrorMessage(categories.error)} retry={() => { void categories.refetch(); }} /> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
        <View style={{ width: fieldWidth }}><FormField label="제품명 *" value={draft.name} onChangeText={(value) => update('name', value)} error={errors.name} maxLength={200} editable={!pending} /></View>
        <View style={{ width: fieldWidth }}><BrandPicker value={draft.brand_id} legacyName={draft.brand_name} onChange={(id, name) => { update('brand_id', id); update('brand_name', name); }} error={errors.brand_id ?? errors.brand_name} disabled={pending} /></View>
      </View>
      <View style={{ gap: 12 }}><Text style={{ color: colors.text, fontWeight: '600' }}>옷 종류 *</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{roots.map((category) => <Choice key={category.slug} label={category.label_ko} selected={parentSlug === category.slug} disabled={pending} onPress={() => update('category_slug', category.slug)} />)}</View>{errors.category_slug && <Text accessibilityRole="alert" style={{ color: '#A52727' }}>{errors.category_slug}</Text>}</View>
      {children.length > 0 && <View style={{ gap: 12 }}><Text style={{ color: colors.muted }}>세부 분류 (선택)</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Choice label="대분류로 등록" selected={draft.category_slug === parentSlug} disabled={pending} onPress={() => update('category_slug', parentSlug ?? '')} />{children.map((category) => <Choice key={category.slug} label={category.label_ko} selected={draft.category_slug === category.slug} disabled={pending} onPress={() => update('category_slug', category.slug)} />)}</View></View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
        <View style={{ width: fieldWidth }}><FormField label="색상" value={draft.color_name} onChangeText={(value) => update('color_name', value)} error={errors.color_name} maxLength={60} editable={!pending} /></View>
        <View style={{ width: fieldWidth }}><FormField label="사이즈" value={draft.size_label} onChangeText={(value) => update('size_label', value)} error={errors.size_label} maxLength={60} editable={!pending} /></View>
      </View>
      <Pressable accessibilityRole="button" aria-expanded={advanced} onPress={() => setAdvanced((value) => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '600' }}>{advanced ? '추가 정보 접기 −' : '추가 정보 입력 +'}</Text></Pressable>
      {advanced && <View style={{ gap: 24 }}>
        <View style={{ gap: 12 }}><Text style={{ color: colors.text, fontWeight: '600' }}>계절 (복수 선택)</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{seasons.map((season) => <Choice key={season} label={seasonLabels[season]} selected={draft.seasons.includes(season)} disabled={pending} onPress={() => update('seasons', draft.seasons.includes(season) ? draft.seasons.filter((value) => value !== season) : [...draft.seasons, season])} />)}</View>{errors.seasons && <Text accessibilityRole="alert" style={{ color: '#A52727' }}>{errors.seasons}</Text>}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          <View style={{ width: fieldWidth }}><FormField label="구매 가격" placeholder="예: 125000 또는 125,000" value={draft.purchase_price} keyboardType="decimal-pad" onChangeText={(value) => update('purchase_price', value)} error={errors.purchase_price} editable={!pending} /></View>
          <View style={{ width: fieldWidth }}><FormField label="통화 코드" value={draft.currency} autoCapitalize="characters" onChangeText={(value) => update('currency', value)} error={errors.currency} maxLength={3} editable={!pending} /></View>
          <View style={{ width: fieldWidth }}><FormField label="구매일" placeholder="YYYY-MM-DD" value={draft.purchased_on} onChangeText={(value) => update('purchased_on', value)} error={errors.purchased_on} maxLength={10} editable={!pending} /></View>
          <View style={{ width: fieldWidth }}><FormField label="소재" value={draft.material} onChangeText={(value) => update('material', value)} error={errors.material} maxLength={200} editable={!pending} /></View>
          <View style={{ width: fieldWidth }}><FormField label="색상 코드" placeholder="#20232D" value={draft.color_hex} onChangeText={(value) => update('color_hex', value)} error={errors.color_hex} maxLength={7} editable={!pending} /></View>
        </View>
        <FormField label="태그" placeholder="쉼표로 구분, 최대 20개" value={draft.tags} onChangeText={(value) => update('tags', value)} error={errors.tags} editable={!pending} />
        <FormField label="구매처 링크" placeholder="https://" value={draft.purchase_url} autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={(value) => update('purchase_url', value)} error={errors.purchase_url} editable={!pending} />
        <FormField label="메모" value={draft.notes} multiline textAlignVertical="top" style={{ minHeight: 120 }} onChangeText={(value) => update('notes', value)} error={errors.notes} maxLength={5000} editable={!pending} />
      </View>}
      {message && <Text accessibilityRole="alert" style={{ color: '#A52727', lineHeight: 24 }}>{message}</Text>}
      <ActionButton label={base ? '변경 내용 저장' : '옷 저장'} onPress={() => { void submit(); }} loading={pending} disabled={unavailable} />
      {base && <ActionButton variant="secondary" label="최신 정보로 다시 편집" disabled={pending} onPress={() => { if (dirty) setConfirmation('reload'); else void reloadLatest(); }} />}
    </>}
  </View>;
}
