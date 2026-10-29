import { Link, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { SelectField } from '@/components/ui/SelectField';
import { useTheme } from '@/theme/useTheme';
import { wardrobeErrorMessage } from './errors';
import { FavoriteButton } from './FavoriteButton';
import { useWardrobeActions, useWardrobeUsage } from './queries';
import { lifecycleLabels, type WardrobeItem } from './types';

type Request = { kind: 'status'; status: string; version: string } | { kind: 'delete'; version: string };
export function WardrobeManageControls({ item, actions }: { item: WardrobeItem; actions: ReturnType<typeof useWardrobeActions> }) {
  const colors = useTheme();
  const router = useRouter();
  const usage = useWardrobeUsage(item.id);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [request, setRequest] = useState<Request | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lock = useRef(false);
  function ask(next: Request) { setRequest(next); setFeedback(null); void usage.refetch(); }
  async function confirm() {
    if (!request || lock.current || usage.isFetching || !usage.data || usage.isError || request.version !== item.updated_at) return;
    lock.current = true; setBusy(true); setFeedback(null);
    try {
      const changed = await actions.perform((repository, signal) => request.kind === 'delete' ? repository.softDelete(item.id, request.version, signal) : repository.setStatus(item.id, request.version, request.status, signal));
      if (changed) { if (request.kind === 'delete') router.replace('/wardrobe'); else if (mounted.current) setRequest(null); }
    } catch (cause) { if (actions.isActive() && mounted.current) setFeedback(wardrobeErrorMessage(cause)); }
    finally { lock.current = false; if (actions.isActive() && mounted.current) setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <Link href={{ pathname: '/wardrobe/edit/[itemId]', params: { itemId: item.id } }} asChild><Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center' }}><Text style={{ color: colors.onPrimary, fontWeight: '700' }}>정보 수정</Text></Pressable></Link>
      <FavoriteButton item={item} compact disabled={busy || request !== null} />
    </View>
    <SelectField label="옷 상태 변경" value={item.lifecycle_status} disabled={busy || request !== null} options={Object.entries(lifecycleLabels).map(([value, label]) => ({ value, label }))} onChange={(status) => { if (status !== item.lifecycle_status) ask({ kind: 'status', status, version: item.updated_at }); }} />
    <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 12, gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700' }}>연결된 코디와 착용 기록</Text>
      {usage.isPending || usage.isFetching ? <Text style={{ color: colors.muted }}>연결 정보를 확인하는 중…</Text> : usage.isError ? <><Text accessibilityRole="alert" style={{ color: colors.muted }}>연결 정보를 확인하지 못했어요. 상태 변경·삭제 전에 다시 확인해 주세요.</Text><ActionButton variant="secondary" label="연결 정보 다시 확인" onPress={() => { void usage.refetch(); }} /></> : <>
        <Text style={{ color: colors.text }}>코디 {usage.data.outfit_count}개 · 착용 기록 {usage.data.wear_count}개</Text>
        {usage.data.outfit_names.slice(0, 20).map((name, index) => <Text key={index} style={{ color: colors.muted }}>· {name}</Text>)}
        {usage.data.outfit_names.length > 20 && <Text style={{ color: colors.muted }}>외 {usage.data.outfit_names.length - 20}개</Text>}
        {item.lifecycle_status !== 'active' && usage.data.outfit_count > 0 && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 22 }}>이 옷은 {lifecycleLabels[item.lifecycle_status]} 상태이며 연결된 코디에서 사용할 수 없는 옷입니다. 코디 연결과 과거 착용 기록은 유지됩니다.</Text>}
      </>}
    </View>
    <ActionButton variant="secondary" label="휴지통으로 이동" disabled={busy || request !== null} onPress={() => ask({ kind: 'delete', version: item.updated_at })} />
    {request && <View style={{ gap: 12, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{request.kind === 'delete' ? '휴지통으로 이동할까요?' : `${lifecycleLabels[request.status]} 상태로 바꿀까요?`}</Text>
      <Text style={{ color: colors.muted, lineHeight: 24 }}>{request.kind === 'delete' ? '목록에서는 숨겨지며 휴지통에서 기존 상태로 복원할 수 있어요. 사진·코디 연결·과거 착용 기록은 보존됩니다.' : '사진·코디 연결·과거 착용 기록은 보존됩니다. 보관·판매·기부 상태의 옷은 새 코디에 사용할 수 없어요.'}</Text>
      {usage.data && <Text style={{ color: colors.text }}>현재 연결: 코디 {usage.data.outfit_count}개, 착용 기록 {usage.data.wear_count}개</Text>}
      {request.version !== item.updated_at && <Text accessibilityRole="alert" style={{ color: colors.danger }}>다른 곳에서 옷 정보가 바뀌었습니다. 취소 후 최신 정보를 확인해 주세요.</Text>}
      <ActionButton variant="secondary" label="변경 취소" disabled={busy} onPress={() => setRequest(null)} />
      <ActionButton label={request.kind === 'delete' ? '휴지통 이동 확인' : '상태 변경 확인'} disabled={usage.isFetching || usage.isError || !usage.data || request.version !== item.updated_at} loading={busy} onPress={() => { void confirm(); }} />
    </View>}
    {feedback && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 24 }}>{feedback}</Text>}
  </View>;
}
