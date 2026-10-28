import { randomUUID } from 'expo-crypto';
import { usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { ZodError } from 'zod';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { useAppNavigationBlocker } from '@/providers/NavigationGuard';
import { useTheme } from '@/theme/useTheme';
import { Choice, WardrobeHeader } from '../wardrobe/components';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto } from '../wardrobe/photos/model';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { lifecycleLabels } from '../wardrobe/types';
import { emptyWearDraft, wearDraftFingerprint, wearFormInput, type WearFormDraft } from './calendar';
import { maxWearItems, wearDateSchema, WearError, wearErrorMessage } from './model';
import { useWearActions, useWearSelectedItems } from './queries';
import type { SavedWearEvent } from './repository';
import { WearItemPicker, WearOutfitPicker } from './Pickers';

function editingDraft(event: SavedWearEvent): WearFormDraft { return { wornOn: event.worn_on, memo: event.memo ?? '', mode: 'keep', outfit: null, itemIds: [] }; }
type Confirmation = { kind: 'leave'; repeat: () => void } | { kind: 'reload' | 'delete' };

export function WearFormScreen({ initialDate, initialEvent }: { initialDate: string; initialEvent?: SavedWearEvent }) {
  const colors = useTheme(); const router = useRouter(); const actions = useWearActions();
  const [base, setBase] = useState(initialEvent ?? null);
  const [draft, setDraft] = useState(() => initialEvent ? editingDraft(initialEvent) : emptyWearDraft(initialDate));
  const [baseline, setBaseline] = useState(() => wearDraftFingerprint(initialEvent ? editingDraft(initialEvent) : emptyWearDraft(initialDate)));
  const [requestId] = useState(randomUUID);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dirty = wearDraftFingerprint(draft) !== baseline;
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => setConfirmation({ kind: 'leave', repeat }));
  useAppNavigationBlocker(dirty, (proceed) => setConfirmation({ kind: 'leave', repeat: () => { disablePrevention(); proceed(); } }));
  const ids = draft.mode === 'keep' ? base?.wear_event_items.map((entry) => entry.item_id) ?? [] : draft.mode === 'outfit' ? draft.outfit?.itemIds ?? [] : draft.itemIds;
  const visibleIds = ids.slice(0, maxWearItems);
  const items = useWearSelectedItems(visibleIds);
  const photos = usePhotos(visibleIds);
  function change(patch: Partial<WearFormDraft>) { setDraft((previous) => ({ ...previous, ...patch })); setMessage(null); setErrors({}); }
  function goBack(date = draft.wornOn) {
    const destination = wearDateSchema.safeParse(date).success ? date : initialDate;
    disablePrevention(); router.replace({ pathname: '/calendar', params: { date: destination } });
  }
  async function save() {
    if (lock.current || unavailable) return;
    setMessage(null); setErrors({});
    let input;
    try { input = wearFormInput(draft); }
    catch (error) {
      if (error instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of error.issues) fields[String(issue.path[0])] ??= String(issue.path[0]) === 'wornOn' ? '올바른 날짜를 YYYY-MM-DD로 입력해 주세요.' : issue.message;
        setErrors(fields); setMessage('날짜·메모·선택한 구성을 확인해 주세요.');
      } else setMessage(wearErrorMessage(error));
      return;
    }
    lock.current = true; setBusy(true);
    try {
      const saved = await actions.perform((repository, signal) => {
        if (base) return repository.update(base.id, base.updated_at, input, signal);
        if (input.kind === 'keep') throw new WearError('selection_required');
        return repository.record(requestId, input, signal);
      });
      if (saved) goBack(saved.worn_on);
    } catch (error) { if (actions.isActive()) setMessage(wearErrorMessage(error)); }
    finally { lock.current = false; if (actions.isActive()) setBusy(false); }
  }
  async function storedAction(kind: 'reload' | 'delete') {
    if (!base || lock.current) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      if (kind === 'delete') {
        const deleted = await actions.perform((repository, signal) => repository.remove(base.id, base.updated_at, signal));
        if (deleted) goBack(deleted.worn_on);
      } else {
        const latest = await actions.perform((repository, signal) => repository.get(base.id, signal));
        if (!actions.isActive()) return;
        if (!latest) { setUnavailable(true); setMessage('이 기록은 삭제되었거나 접근할 수 없습니다. 입력은 유지했어요.'); }
        else { const next = editingDraft(latest); setBase(latest); setDraft(next); setBaseline(wearDraftFingerprint(next)); setErrors({}); setUnavailable(false); }
      }
    } catch (error) { if (actions.isActive()) setMessage(wearErrorMessage(error)); }
    finally { lock.current = false; if (actions.isActive()) { setBusy(false); setConfirmation(null); } }
  }
  return <View style={{ gap: 24, width: '100%', maxWidth: 860, alignSelf: 'center' }}>
    <ActionButton variant="secondary" label="착용 달력으로 돌아가기" disabled={busy} onPress={() => { if (dirty) setConfirmation({ kind: 'leave', repeat: () => goBack() }); else goBack(); }} />
    <WardrobeHeader title={base ? '착용 기록 수정' : '착용 기록 추가'} description={base ? '날짜와 메모를 고치거나, 직접 선택해 기록된 구성을 교체할 수 있어요.' : '입었던 코디나 옷을 골라 기록해 보세요. 같은 날 여러 기록을 남길 수 있어요.'} />
    <FormField label="착용 날짜 (YYYY-MM-DD)" value={draft.wornOn} maxLength={10} editable={!busy} error={errors.wornOn} onChangeText={(wornOn) => change({ wornOn })} />
    <FormField label="착용 메모" value={draft.memo} maxLength={5000} multiline editable={!busy} error={errors.memo} onChangeText={(memo) => change({ memo })} style={{ minHeight: 100 }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {base && <Choice label="기존 구성 유지" selected={draft.mode === 'keep'} disabled={busy} onPress={() => change({ mode: 'keep' })} />}
      <Choice label={base ? '다른 코디로 교체' : '코디 선택'} selected={draft.mode === 'outfit'} disabled={busy} onPress={() => change({ mode: 'outfit' })} />
      <Choice label={base ? '개별 의류로 교체' : '개별 의류 선택'} selected={draft.mode === 'items'} disabled={busy} onPress={() => change({ mode: 'items' })} />
    </View>
    {draft.mode === 'keep' && <Text style={{ color: colors.muted, lineHeight: 23 }}>당시 구성을 그대로 유지합니다. 옷이 보관·판매·기부·휴지통 상태로 바뀌었어도 날짜와 메모는 고칠 수 있어요.</Text>}
    {draft.mode === 'outfit' && <WearOutfitPicker selected={draft.outfit} disabled={busy} onChoose={(outfit) => change({ outfit })} />}
    {draft.mode === 'items' && <WearItemPicker selected={draft.itemIds} disabled={busy} onToggle={(id) => change({ itemIds: draft.itemIds.includes(id) ? draft.itemIds.filter((value) => value !== id) : [...draft.itemIds, id].sort() })} />}
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>기록할 구성 · {ids.length}벌</Text>
    {visibleIds.length > 0 && (items.isError || photos.isError) && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: '#A52727' }}>선택한 옷이나 사진을 확인하지 못했어요.</Text><ActionButton variant="secondary" label="선택한 구성 다시 확인" disabled={busy} onPress={() => { void Promise.all([items.refetch(), photos.refetch()]); }} /></View>}
    {visibleIds.map((id) => {
      const item = items.data?.find((entry) => entry.id === id);
      const problem = !items.isPending && (!item || item.deleted_at || item.lifecycle_status !== 'active');
      return <View key={id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center' }}>
        <View style={{ width: 64 }}><PhotoFrame photo={primaryPhoto(photos.data ?? [], id)} loading={photos.isPending} error={photos.isError} /></View>
        <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 5 }}><Text style={{ color: colors.text }}>{item?.name ?? (items.isPending ? '옷 확인 중…' : '확인할 수 없는 옷')}</Text>{problem && <Text style={{ color: draft.mode === 'keep' ? colors.muted : '#A52727', fontSize: 12 }}>{item?.deleted_at ? '휴지통에 있는 옷' : item ? lifecycleLabels[item.lifecycle_status] : '확인할 수 없는 옷'}{draft.mode === 'keep' ? ' · 당시 구성 유지' : ' · 다른 옷을 선택해 주세요'}</Text>}</View>
        {draft.mode === 'items' && <ActionButton variant="secondary" label="구성에서 제거" disabled={busy} onPress={() => change({ itemIds: draft.itemIds.filter((value) => value !== id) })} />}
      </View>;
    })}
    {!ids.length && <Text style={{ color: colors.muted }}>코디나 의류를 선택해 주세요.</Text>}
    {ids.length > visibleIds.length && <Text style={{ color: colors.muted }}>추가 {ids.length - visibleIds.length}벌은 기존 구성으로 유지됩니다.</Text>}
    {errors.itemIds && <Text accessibilityRole="alert" style={{ color: '#A52727' }}>{errors.itemIds}</Text>}
    {message && <Text accessibilityRole="alert" style={{ color: '#A52727', lineHeight: 23 }}>{message}</Text>}
    <ActionButton label={base ? '착용 기록 변경 저장' : '착용 기록 저장'} loading={busy} disabled={unavailable || Boolean(base && !dirty)} onPress={() => { void save(); }} />
    {base && <><ActionButton variant="secondary" label="최신 기록 불러오기" disabled={busy} onPress={() => setConfirmation({ kind: 'reload' })} /><ActionButton variant="secondary" label="착용 기록 삭제" disabled={busy || unavailable} onPress={() => setConfirmation({ kind: 'delete' })} /></>}
    <Modal visible={confirmation !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirmation(null); }}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, justifyContent: 'center' }}><View accessibilityViewIsModal style={{ gap: 16, padding: 24, borderRadius: 14, backgroundColor: colors.background, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>{confirmation?.kind === 'delete' ? '착용 기록을 삭제할까요?' : confirmation?.kind === 'reload' ? '최신 기록을 불러올까요?' : '저장하지 않은 변경이 있어요'}</Text>
      <Text style={{ color: colors.muted, lineHeight: 23 }}>{confirmation?.kind === 'delete' ? '이 기록이 달력과 착용 횟수에서 빠집니다. 옷과 저장한 코디는 유지됩니다.' : confirmation?.kind === 'reload' ? '현재 입력을 버리고 최신 저장 내용으로 교체합니다.' : '변경을 버리고 달력으로 돌아갑니다.'}</Text>
      <ActionButton variant="secondary" label="계속 편집" disabled={busy} onPress={() => setConfirmation(null)} />
      <ActionButton label={confirmation?.kind === 'delete' ? '착용 기록 삭제 확인' : confirmation?.kind === 'reload' ? '최신 내용으로 교체' : '변경 버리고 이동'} loading={busy} onPress={() => { const current = confirmation; if (current?.kind === 'leave') { setConfirmation(null); current.repeat(); } else if (current) void storedAction(current.kind); }} />
    </View></View></Modal>
  </View>;
}
