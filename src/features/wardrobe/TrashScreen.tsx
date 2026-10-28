import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/theme/useTheme';
import { WardrobeBackLink, WardrobeHeader, WardrobeState } from './components';
import { useWardrobeActions, useWardrobeTrash } from './queries';
import { usePhotos } from './photos/hooks';
import { PhotoFrame } from './photos/PhotoFrame';
import { primaryPhoto } from './photos/model';
import { wardrobeErrorMessage } from './errors';
import { lifecycleLabels, wardrobePageSize, type WardrobeItem } from './types';

export function WardrobeTrashScreen() {
  const colors = useTheme();
  const [page, setPage] = useState(0);
  const query = useWardrobeTrash(page);
  const photos = usePhotos(query.data?.items.map((item) => item.id) ?? []);
  const actions = useWardrobeActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lock = useRef(false);
  const lastPage = query.data ? Math.max(0, Math.ceil(query.data.total / wardrobePageSize) - 1) : page;
  if (page > lastPage) setPage(lastPage);
  async function restore(item: WardrobeItem) {
    if (lock.current) return;
    lock.current = true; setBusy(item.id); setFeedback(null);
    try { const restored = await actions.perform((repository, signal) => repository.restore(item.id, item.updated_at, signal)); if (restored) setFeedback('기존 상태로 복원했습니다. 내 옷장에서 확인해 주세요.'); }
    catch (cause) { if (actions.isActive()) setFeedback(wardrobeErrorMessage(cause)); }
    finally { lock.current = false; if (actions.isActive()) setBusy(null); }
  }
  return <View style={{ gap: 24, width: '100%', maxWidth: 960, alignSelf: 'center' }}>
    <WardrobeBackLink /><WardrobeHeader title="휴지통" description="삭제한 옷을 기존 상태로 복원할 수 있어요. 사진과 연결 기록도 함께 보존돼요." />
    {feedback && <Text accessibilityLiveRegion="polite" style={{ color: colors.text, lineHeight: 24 }}>{feedback}</Text>}
    {query.isPending ? <WardrobeState title="휴지통을 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="휴지통을 불러오지 못했어요" message={wardrobeErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <>
      <Text style={{ color: colors.muted }}>{query.data.total}개의 삭제된 옷</Text>
      {query.data.items.length === 0 && <WardrobeState title="휴지통이 비어 있어요" message="휴지통으로 이동한 옷이 이곳에 표시됩니다." />}
      {query.data.items.map((item) => <View key={item.id} style={{ gap: 16, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}><View style={{ width: 80 }}><PhotoFrame photo={primaryPhoto(photos.data ?? [], item.id)} loading={photos.isPending} error={photos.isError} /></View><View style={{ flex: 1, minWidth: 0, gap: 8 }}><Text style={{ color: colors.text, fontWeight: '700', lineHeight: 22 }}>{item.name}</Text><Text style={{ color: colors.muted }}>복원 시 상태: {lifecycleLabels[item.lifecycle_status]}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>이동일: {new Date(item.deleted_at!).toLocaleDateString('ko-KR')}</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 복원`} disabled={busy !== null} onPress={() => { void restore(item); }} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, opacity: busy ? 0.5 : 1 }}><Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{busy === item.id ? '복원 중…' : '복원'}</Text></Pressable>
      </View>)}
      {(page > 0 || query.data.total > wardrobePageSize) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}><ActionButton variant="secondary" label="이전 페이지" disabled={page === 0 || query.isFetching || busy !== null} onPress={() => setPage((value) => value - 1)} /><Text style={{ color: colors.muted }}>{page + 1} / {lastPage + 1}</Text><ActionButton variant="secondary" label="다음 페이지" disabled={page >= lastPage || query.isFetching || busy !== null} onPress={() => setPage((value) => value + 1)} /></View>}
    </>}
  </View>;
}
