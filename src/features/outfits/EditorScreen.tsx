import { usePreventRemove, useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { useUserId } from '@/providers/AppProviders';
import { useAppNavigationBlocker } from '@/providers/NavigationGuard';
import { useTheme } from '@/theme/useTheme';
import { Choice } from '../wardrobe/components';
import { useCategories } from '../wardrobe/queries';
import { usePhotos } from '../wardrobe/photos/hooks';
import { seasons, seasonLabels } from '../wardrobe/types';
import { OutfitBoard } from './Board';
import { chooseItem, emptyOutfitDraft, outfitDraftSchema, removeItem, selectionProblem, type OutfitDraft, type OutfitSlot } from './draft';
import { OutfitPicker } from './Picker';
import { OutfitControl } from './EditorControls';
import { useOutfitActions, useOutfitSelectionActions, useSelectedOutfitItems } from './queries';
import { selectionErrorMessage } from './selection';
import type { SavedOutfit } from './catalog';
import type { Tables } from '@/types/database.generated';
import { outfitErrorCode, outfitErrorMessage, outfitToDraft } from './repository';

type Discard = { kind: 'leave'; repeat: () => void } | { kind: 'clear' | 'reload' | 'delete' };
export function OutfitEditorScreen({ initialOutfit }: { initialOutfit?: SavedOutfit }) {
  const colors = useTheme();
  const router = useRouter();
  const owner = useUserId()!;
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const [draft, setDraft] = useState(() => initialOutfit ? outfitToDraft(initialOutfit) : emptyOutfitDraft());
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialOutfit ? outfitToDraft(initialOutfit) : emptyOutfitDraft()));
  const [base, setBase] = useState<Tables<'outfits'> | null>(initialOutfit ?? null);
  const [requestId] = useState(randomUUID);
  const copyId = useRef<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [activeSlot, setActiveSlot] = useState<OutfitSlot>('top');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [discard, setDiscard] = useState<Discard | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [valid, setValid] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const actions = useOutfitSelectionActions();
  const writes = useOutfitActions();
  const categories = useCategories();
  const ids = Object.values(draft.items);
  const selected = useSelectedOutfitItems(ids);
  const photos = usePhotos(ids);
  const dirty = JSON.stringify(draft) !== baseline;
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => setDiscard({ kind: 'leave', repeat }));
  useAppNavigationBlocker(dirty, (proceed) => setDiscard({ kind: 'leave', repeat: () => { disablePrevention(); proceed(); } }));
  function update(change: Partial<OutfitDraft>) { setDraft((previous) => ({ ...previous, ...change })); setMessage(null); setErrors({}); setValid(false); }
  function chooseSlot(slot: OutfitSlot) { if (lock.current) return; setMessage(null); setActiveSlot(slot); setPickerOpen(!desktop); }
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
      if (result) { setValid(true); setMessage(`선택한 옷 ${result.value.items.length}개를 사용할 수 있어요. 저장 버튼을 눌러 변경을 저장해 주세요.`); }
    } catch (error) { if (actions.isActive()) setMessage(selectionErrorMessage(error)); }
    finally { lock.current = false; if (actions.isActive()) { setBusy(false); void actions.refresh(); } }
  }
  function writeFailure(error: unknown) {
    if (!writes.isActive()) return;
    setValid(false); setMessage(outfitErrorMessage(error));
    if (outfitErrorCode(error) === '40001' || outfitErrorCode(error) === 'P0002') setConflict(true);
  }
  async function save() {
    if (lock.current) return;
    const parsed = outfitDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
      setErrors(fields); setValid(false); setMessage('코디 이름과 선택한 옷, 입력값을 확인해 주세요.');
      if (fields.memo || fields.tags || fields.occasion || fields.seasons) setAdvanced(true);
      return;
    }
    lock.current = true; setBusy(true); setErrors({}); setMessage(null);
    try {
      const result = await writes.perform((repository, signal) => repository.save(base?.id ?? requestId, base?.updated_at ?? null, draft, signal));
      if (result) {
        const stored = result.value;
        const next = { ...draft, name: stored.name, memo: stored.memo ?? '', occasion: stored.occasion ?? '', tags: stored.tags.join(', '), seasons: [...stored.seasons], isFavorite: stored.is_favorite };
        setBase(stored); setDraft(next); setBaseline(JSON.stringify(next)); setValid(true); setConflict(false); setMessage('코디를 저장했어요.');
        if (!base) { disablePrevention(); router.replace({ pathname: '/outfits/[outfitId]', params: { outfitId: result.value.id } }); }
      }
    } catch (error) { writeFailure(error); }
    finally { lock.current = false; if (writes.isActive()) { setBusy(false); void actions.refresh(); } }
  }
  async function copy() {
    if (lock.current || !base || dirty) return;
    lock.current = true; setBusy(true); setMessage(null);
    copyId.current ??= randomUUID();
    const destination = copyId.current;
    try {
      const result = await writes.perform((repository, signal) => repository.copy(base.id, base.updated_at, destination, signal));
      if (result) { disablePrevention(); router.replace({ pathname: '/outfits/[outfitId]', params: { outfitId: result.value.id } }); }
    } catch (error) { writeFailure(error); }
    finally { lock.current = false; if (writes.isActive()) setBusy(false); }
  }
  async function confirmStoredAction(kind: 'reload' | 'delete') {
    if (lock.current || (kind === 'delete' && !base)) return;
    lock.current = true; setBusy(true); setMessage(null); setValid(false);
    try {
      if (kind === 'delete') {
        const result = await writes.perform((repository, signal) => repository.remove(base!.id, base!.updated_at, signal));
        if (result) { disablePrevention(); router.replace('/outfits'); }
      } else {
        const result = await writes.perform((repository, signal) => repository.get(base?.id ?? requestId, signal));
        if (result) {
          if (!result.value) { setMessage('코디가 삭제되었거나 접근할 수 없습니다. 입력은 유지했어요.'); setConflict(true); setDiscard(null); return; }
          const next = outfitToDraft(result.value);
          setBase(result.value); setDraft(next); setBaseline(JSON.stringify(next)); copyId.current = null;
          setErrors({}); setConflict(false); setMessage('최신 코디를 불러왔어요.'); setValid(true); setDiscard(null);
        }
      }
    } catch (error) { writeFailure(error); setDiscard(null); }
    finally { lock.current = false; if (writes.isActive()) setBusy(false); }
  }
  const problems = !selected.isFetching && !categories.isPending && !selected.isError && !categories.isError && Object.entries(draft.items).some(([slot, id]) => selectionProblem(selected.data?.find((item) => item.id === id), slot as OutfitSlot, owner, categories.data ?? []));
  const retrySelection = () => { void Promise.all([selected.refetch(), photos.refetch(), categories.refetch()]); };
  const board = <View testID="outfit-board-panel" style={{ flexGrow: desktop ? 54 : 0, flexBasis: desktop ? 0 : 'auto', width: desktop ? undefined : '100%', minWidth: 0, gap: 12 }}>
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background }}>
      <OutfitBoard draft={draft} owner={owner} items={selected.data ?? []} categories={categories.data ?? []} photos={photos.data ?? []} checking={selected.isFetching || categories.isPending} failed={selected.isError || categories.isError} photoLoading={photos.isPending} photoFailed={photos.isError} busy={busy} activeSlot={activeSlot} onChoose={chooseSlot} onRemove={slot => update({ items: removeItem(draft, slot).items })} />
      <Pressable accessibilityRole="button" accessibilityLabel="코디 추가 정보" accessibilityState={{ expanded: advanced, disabled: busy }} aria-expanded={advanced} disabled={busy} onPress={() => setAdvanced(value => !value)} style={{ minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.muted, fontSize: 13, flexShrink: 1 }}>계절 · 상황 · 태그 · 메모 · 즐겨찾기</Text><Icon name={advanced ? 'up' : 'chevron'} size={16} color={colors.muted} /></Pressable>
      {advanced && <View style={{ padding: 16, gap: 18, borderTopWidth: 1, borderColor: colors.border }}>
        <View style={{ gap: 8 }}><Text style={{ color: colors.muted, fontSize: 13 }}>계절 (복수 선택)</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{seasons.map(season => <Choice key={season} label={seasonLabels[season]} selected={draft.seasons.includes(season)} disabled={busy} onPress={() => update({ seasons: draft.seasons.includes(season) ? draft.seasons.filter(entry => entry !== season) : [...draft.seasons, season] })} />)}</View>{errors.seasons && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>{errors.seasons}</Text>}</View>
        <FormField label="상황" placeholder="예: 캐주얼, 출근, 격식" value={draft.occasion} maxLength={80} editable={!busy} error={errors.occasion} onChangeText={occasion => update({ occasion })} />
        <FormField label="코디 태그" placeholder="쉼표로 구분, 최대 20개" value={draft.tags} editable={!busy} error={errors.tags} onChangeText={tags => update({ tags })} />
        <FormField label="코디 메모" value={draft.memo} multiline style={{ minHeight: 88 }} maxLength={5000} editable={!busy} error={errors.memo} onChangeText={memo => update({ memo })} />
        <Choice label="코디 즐겨찾기" selected={draft.isFavorite} disabled={busy} onPress={() => update({ isFavorite: !draft.isFavorite })} />
      </View>}
    </View>
    {(selected.isError || categories.isError) && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 21 }}>선택한 옷을 확인하지 못했어요. 다시 확인한 뒤 구성 검사를 해 주세요.</Text><OutfitControl label="선택한 옷 다시 확인" icon="refresh" disabled={selected.isFetching || busy} onPress={retrySelection} /></View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><Text style={{ color: colors.muted, fontSize: 12, flexShrink: 1 }}>사진을 눌러 옷을 고르고, ×로 제거할 수 있어요.</Text><OutfitControl variant="quiet" label="코디 도구" icon="settings" expanded={toolsOpen} disabled={busy} onPress={() => setToolsOpen(value => !value)} /></View>
    {toolsOpen && <View style={{ padding: 12, gap: 8, backgroundColor: colors.surface, borderRadius: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><OutfitControl label="코디 구성 확인" disabled={busy} onPress={() => { void check(); }} />{ids.length > 0 && <OutfitControl label="선택한 옷 다시 확인" icon="refresh" disabled={selected.isFetching || busy} onPress={retrySelection} />}</View>
      {base ? <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><OutfitControl label="코디 복제" disabled={busy || dirty || conflict} onPress={() => { void copy(); }} /><OutfitControl label="최신 코디 불러오기" disabled={busy} onPress={() => setDiscard({ kind: 'reload' })} /><OutfitControl label="코디 삭제" icon="trash" disabled={busy || conflict} onPress={() => setDiscard({ kind: 'delete' })} /></View>{dirty && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>변경을 저장한 뒤 복제할 수 있어요.</Text>}</> : conflict && <OutfitControl label="최신 코디 불러오기" disabled={busy} onPress={() => setDiscard({ kind: 'reload' })} />}
    </View>}
  </View>;
  return <View testID="outfit-editor" style={{ gap: 20 }}>
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, letterSpacing: 1.5, fontSize: 11, fontWeight: '700' }}>BUILD YOUR LOOK</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 29, fontWeight: '800' }}>{base ? '코디 수정' : '코디 만들기'}</Text><OutfitControl variant="quiet" label="저장한 코디로 돌아가기" disabled={busy} onPress={() => { if (dirty) setDiscard({ kind: 'leave', repeat: () => { disablePrevention(); router.replace('/outfits'); } }); else router.replace('/outfits'); }} /></View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{desktop ? '코디 보드와 내 옷장을 나란히 보며 새로운 조합을 만들어 보세요.' : '슬롯을 누르고 내 옷장에서 어울리는 옷을 골라보세요.'}</Text>
    </View>
    <View testID="outfit-editor-actions" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
      <View style={{ flexGrow: 1, flexBasis: desktop ? 340 : '100%', maxWidth: desktop ? 460 : undefined, minWidth: 0 }}><FormField label="코디 이름 *" value={draft.name} maxLength={160} editable={!busy} error={errors.name} onChangeText={name => update({ name })} style={{ minHeight: 44, borderRadius: 8, padding: 10, fontSize: desktop ? 14 : 16 }} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginLeft: 'auto' }}><Text style={{ color: colors.muted, fontSize: 11, paddingHorizontal: 4 }}>{busy ? '코디 작업 중…' : dirty ? '미저장 변경' : base ? '저장됨' : '새 코디'}</Text>{!base && <OutfitControl variant="quiet" label="초안 비우기" disabled={!dirty || busy} onPress={() => setDiscard({ kind: 'clear' })} />}<OutfitControl variant="primary" label={base ? '코디 변경 저장' : '코디 저장'} loading={busy} disabled={conflict || Boolean(base && !dirty)} onPress={() => { void save(); }} /></View>
    </View>
    {errors.items && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{errors.items}</Text>}
    {message && (!valid || (!problems && !selected.isError && !categories.isError && !selected.isFetching)) && <Text accessibilityLiveRegion="polite" style={{ color: valid ? colors.primary : colors.danger, fontSize: 13, lineHeight: 22 }}>{message}</Text>}
    <View testID="outfit-workspace" style={{ flexDirection: desktop ? 'row' : 'column', alignItems: 'flex-start', gap: 20 }}>
      {board}
      {desktop && <View testID="outfit-picker-panel" style={{ flexGrow: 46, flexBasis: 0, minWidth: 0 }}><OutfitPicker key={activeSlot} slot={activeSlot} selectedId={draft.items[activeSlot]} busy={busy} onSelect={id => { void select(id); }} onSlotChange={chooseSlot} /></View>}
    </View>

    {!desktop && pickerOpen && <Modal visible animationType="slide" onRequestClose={() => { if (!busy) setPickerOpen(false); }}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ padding: 16 }}><ActionButton variant="secondary" label="옷 선택 닫기" disabled={busy} onPress={() => setPickerOpen(false)} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}><OutfitPicker key={activeSlot} slot={activeSlot} selectedId={draft.items[activeSlot]} busy={busy} onSelect={(id) => { void select(id); }} onSlotChange={chooseSlot} />{message && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 24 }}>{message}</Text>}</ScrollView></SafeAreaView></Modal>}
    <Modal visible={discard !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setDiscard(null); }}><View style={{ flex: 1, padding: 24, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' }}><View accessibilityViewIsModal style={{ padding: 24, gap: 16, borderRadius: 16, backgroundColor: colors.background, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{discard?.kind === 'delete' ? '코디를 삭제할까요?' : discard?.kind === 'reload' ? '최신 코디를 불러올까요?' : '저장하지 않은 코디가 있어요'}</Text>
      <Text style={{ color: colors.muted, lineHeight: 24 }}>{discard?.kind === 'delete' ? '저장한 코디 목록에서 제거합니다. 저장하지 않은 변경은 버려지며, 옷과 과거 착용 기록은 유지됩니다.' : discard?.kind === 'reload' ? '현재 입력을 버리고 서버에 저장된 최신 코디로 교체합니다.' : discard?.kind === 'leave' ? '저장하지 않은 변경을 버리고 이동합니다.' : '이름과 선택한 옷을 포함한 초안 전체를 비울까요?'}</Text>
      <ActionButton variant="secondary" label="계속 편집" disabled={busy} onPress={() => setDiscard(null)} />
      <ActionButton label={discard?.kind === 'delete' ? '코디 삭제 확인' : discard?.kind === 'reload' ? '최신 내용으로 교체' : discard?.kind === 'leave' ? '변경 버리고 이동' : '초안 전체 비우기'} loading={busy} onPress={() => {
        const blocked = discard;
        if (blocked?.kind === 'reload' || blocked?.kind === 'delete') { void confirmStoredAction(blocked.kind); return; }
        setDraft(emptyOutfitDraft()); setMessage(null); setErrors({}); setValid(false); setDiscard(null);
        if (blocked?.kind === 'leave') blocked.repeat();
      }} />
    </View></View></Modal>
  </View>;
}
