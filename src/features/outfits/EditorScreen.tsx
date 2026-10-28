import { usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { useUserId } from '@/providers/AppProviders';
import { useAppNavigationBlocker } from '@/providers/NavigationGuard';
import { useTheme } from '@/theme/useTheme';
import { Choice } from '../wardrobe/components';
import { useCategories } from '../wardrobe/queries';
import { usePhotos } from '../wardrobe/photos/hooks';
import { seasons, seasonLabels } from '../wardrobe/types';
import { OutfitBoard } from './Board';
import { chooseItem, emptyOutfitDraft, hasDraftChanges, outfitDraftSchema, removeItem, selectionProblem, type OutfitDraft, type OutfitSlot } from './draft';
import { OutfitPicker } from './Picker';
import { useOutfitSelectionActions, useSelectedOutfitItems } from './queries';
import { selectionErrorMessage } from './selection';

type Discard = { kind: 'leave'; repeat: () => void } | { kind: 'clear' };
export function OutfitEditorScreen() {
  const colors = useTheme();
  const router = useRouter();
  const owner = useUserId()!;
  const { width, height } = useWindowDimensions();
  const desktop = width >= 1024;
  const [draft, setDraft] = useState(emptyOutfitDraft);
  const [activeSlot, setActiveSlot] = useState<OutfitSlot>('top');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [discard, setDiscard] = useState<Discard | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [valid, setValid] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const actions = useOutfitSelectionActions();
  const categories = useCategories();
  const ids = Object.values(draft.items);
  const selected = useSelectedOutfitItems(ids);
  const photos = usePhotos(ids);
  const dirty = hasDraftChanges(draft);
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => setDiscard({ kind: 'leave', repeat }));
  useAppNavigationBlocker(dirty, (proceed) => setDiscard({ kind: 'leave', repeat: () => { disablePrevention(); proceed(); } }));
  function update(change: Partial<OutfitDraft>) { setDraft((previous) => ({ ...previous, ...change })); setMessage(null); setErrors({}); setValid(false); }
  function chooseSlot(slot: OutfitSlot) { setActiveSlot(slot); setPickerOpen(!desktop); }
  async function select(id: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(null); setValid(false);
    try {
      const result = await actions.run((service, signal) => service.choose(activeSlot, id, signal));
      if (result) {
        const next = chooseItem(draft, activeSlot, result.value.item, owner, result.value.categories);
        setDraft(next);
        setErrors({}); setPickerOpen(false);
      }
    } catch (error) { if (actions.isActive()) { setMessage(selectionErrorMessage(error)); void actions.refresh(); } }
    finally { lock.current = false; if (actions.isActive()) setBusy(false); }
  }
  async function check() {
    if (lock.current) return;
    setMessage(null); setValid(false);
    const parsed = outfitDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) { const key = String(issue.path[0]); fields[key] ??= issue.message; }
      setErrors(fields); setMessage('코디 이름과 선택한 옷, 입력값을 확인해 주세요.');
      if (fields.memo || fields.tags || fields.occasion || fields.seasons) setAdvanced(true);
      return;
    }
    lock.current = true; setBusy(true); setErrors({});
    try {
      const result = await actions.run((service, signal) => service.validate(draft, signal));
      if (result) { setValid(true); setMessage(`선택한 옷 ${result.value.items.length}개를 사용할 수 있어요. 아직 저장하지 않은 초안입니다.`); }
    } catch (error) { if (actions.isActive()) setMessage(selectionErrorMessage(error)); }
    finally { lock.current = false; if (actions.isActive()) { setBusy(false); void actions.refresh(); } }
  }
  const problems = !selected.isFetching && !categories.isPending && !selected.isError && !categories.isError && Object.entries(draft.items).some(([slot, id]) => selectionProblem(selected.data?.find((item) => item.id === id), slot as OutfitSlot, owner, categories.data ?? []));
  const board = <View style={{ gap: 24, width: desktop ? '62%' : '100%', minWidth: 0 }}>
    <OutfitBoard draft={draft} owner={owner} items={selected.data ?? []} categories={categories.data ?? []} photos={photos.data ?? []} checking={selected.isFetching || categories.isPending} failed={selected.isError || categories.isError} photoLoading={photos.isPending} photoFailed={photos.isError} busy={busy} activeSlot={activeSlot} onChoose={chooseSlot} onRemove={(slot) => { setDraft((previous) => removeItem(previous, slot)); setMessage(null); setValid(false); }} />
    {ids.length > 0 && <ActionButton variant="secondary" label="선택한 옷 다시 확인" disabled={selected.isFetching || busy} onPress={() => { void Promise.all([selected.refetch(), photos.refetch(), categories.refetch()]); }} />}
    {(selected.isError || categories.isError) && <Text accessibilityRole="alert" style={{ color: '#A52727', lineHeight: 22 }}>선택한 옷을 확인하지 못했어요. 선택한 옷 다시 확인 후 구성 검사를 해 주세요.</Text>}
    <FormField label="코디 이름 *" value={draft.name} maxLength={160} editable={!busy} error={errors.name} onChangeText={(name) => update({ name })} />
    <Pressable accessibilityRole="button" aria-expanded={advanced} onPress={() => setAdvanced((value) => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>{advanced ? '코디 추가 정보 접기 −' : '계절·상황·태그·메모 입력 ＋'}</Text></Pressable>
    {advanced && <View style={{ gap: 20 }}>
      <Text style={{ color: colors.text }}>계절 (복수 선택)</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{seasons.map((season) => <Choice key={season} label={seasonLabels[season]} selected={draft.seasons.includes(season)} disabled={busy} onPress={() => update({ seasons: draft.seasons.includes(season) ? draft.seasons.filter((entry) => entry !== season) : [...draft.seasons, season] })} />)}</View>
      <FormField label="상황" placeholder="예: 캐주얼, 출근, 격식" value={draft.occasion} maxLength={80} editable={!busy} error={errors.occasion} onChangeText={(occasion) => update({ occasion })} />
      <FormField label="코디 태그" placeholder="쉼표로 구분, 최대 20개" value={draft.tags} editable={!busy} error={errors.tags} onChangeText={(tags) => update({ tags })} />
      <FormField label="코디 메모" value={draft.memo} multiline style={{ minHeight: 100 }} maxLength={5000} editable={!busy} error={errors.memo} onChangeText={(memo) => update({ memo })} />
      <Choice label="코디 즐겨찾기" selected={draft.isFavorite} disabled={busy} onPress={() => update({ isFavorite: !draft.isFavorite })} />
    </View>}
    {errors.items && <Text accessibilityRole="alert" style={{ color: '#A52727' }}>{errors.items}</Text>}
    {message && (!valid || (!problems && !selected.isError && !categories.isError && !selected.isFetching)) && <Text accessibilityLiveRegion="polite" style={{ color: valid ? colors.primary : '#A52727', lineHeight: 24 }}>{message}</Text>}
    <ActionButton label="코디 구성 확인" loading={busy} onPress={() => { void check(); }} />
    <ActionButton variant="secondary" label="초안 비우기" disabled={!dirty || busy} onPress={() => setDiscard({ kind: 'clear' })} />
    <Text style={{ color: colors.muted, lineHeight: 22 }}>현재는 코디를 조합하고 확인하는 단계입니다. 서버 저장은 다음 단계에서 연결합니다. 화면을 벗어나면 초안이 사라집니다.</Text>
  </View>;
  return <View style={{ gap: 24 }}>
    <ActionButton variant="secondary" label="저장한 코디로 돌아가기" onPress={() => { if (dirty) setDiscard({ kind: 'leave', repeat: () => { disablePrevention(); router.replace('/outfits'); } }); else router.replace('/outfits'); }} />
    <Text style={{ color: colors.muted, letterSpacing: 1.5, fontSize: 11, fontWeight: '700' }}>BUILD YOUR LOOK · 미저장 초안</Text>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>코디 만들기</Text>
    <Text style={{ color: colors.muted, lineHeight: 24 }}>슬롯을 고르고 내 옷으로 새로운 조합을 만들어 보세요. 현재 {ids.length}개 선택</Text>
    {busy && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>선택한 옷을 확인하는 중…</Text>}
    <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: 'flex-start', gap: 24 }}>
      {desktop && <View style={{ width: '35%', minWidth: 0 }}><ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.max(600, height - 220) }}><OutfitPicker key={activeSlot} slot={activeSlot} selectedId={draft.items[activeSlot]} busy={busy} onSelect={(id) => { void select(id); }} /></ScrollView></View>}
      {board}
    </View>
    {!desktop && pickerOpen && <Modal visible animationType="slide" onRequestClose={() => { if (!busy) setPickerOpen(false); }}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ padding: 16 }}><ActionButton variant="secondary" label="옷 선택 닫기" disabled={busy} onPress={() => setPickerOpen(false)} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}><OutfitPicker key={activeSlot} slot={activeSlot} selectedId={draft.items[activeSlot]} busy={busy} onSelect={(id) => { void select(id); }} />{message && <Text accessibilityRole="alert" style={{ color: '#A52727', lineHeight: 24 }}>{message}</Text>}</ScrollView></SafeAreaView></Modal>}
    <Modal visible={discard !== null} transparent animationType="fade" onRequestClose={() => setDiscard(null)}><View style={{ flex: 1, padding: 24, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' }}><View accessibilityViewIsModal style={{ padding: 24, gap: 16, borderRadius: 16, backgroundColor: colors.background, width: '100%', maxWidth: 480, alignSelf: 'center' }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>저장하지 않은 코디가 있어요</Text><Text style={{ color: colors.muted, lineHeight: 24 }}>{discard?.kind === 'leave' ? '변경을 버리고 이동하면 코디 이름과 선택한 옷이 사라집니다.' : '이름과 선택한 옷을 포함한 초안 전체를 비울까요?'}</Text><ActionButton variant="secondary" label="계속 편집" onPress={() => setDiscard(null)} /><ActionButton label={discard?.kind === 'leave' ? '변경 버리고 이동' : '초안 전체 비우기'} onPress={() => { const blocked = discard; setDraft(emptyOutfitDraft()); setMessage(null); setErrors({}); setValid(false); setDiscard(null); if (blocked?.kind === 'leave') blocked.repeat(); }} /></View></View></Modal>
  </View>;
}
