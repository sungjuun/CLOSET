import { randomUUID } from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/theme/useTheme';
import { usePhotoActions, usePhotos } from './hooks';
import { photoErrorMessage, photoLimit, primaryPhoto, type PreparedImage } from './model';
import { preparePhoto, releaseSource } from './prepare';
import { selectPhotos } from './picker';
import { confirmPhotoRemoval } from './confirm';
import { PhotoFrame } from './PhotoFrame';

type Task = { id: string; asset: ImagePickerAsset | null; prepared: PreparedImage | null; status: 'preparing' | 'uploading' | 'error'; error: string | null };

export function PhotoManager({ itemId, canUpload }: { itemId: string; canUpload: boolean }) {
  const colors = useTheme();
  const query = usePhotos([itemId]);
  const actions = usePhotoActions();
  const [tasks,setTasks] = useState<Task[]>([]);
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState<string | null>(null);
  const busyRef = useRef(false);
  const sources = useRef(new Set<ImagePickerAsset>());
  useEffect(() => {
    const set = sources.current;
    return () => { set.forEach(releaseSource); set.clear(); };
  },[]);
  const records = query.data ?? [];
  const ready = records.filter((photo) => photo.upload_status === 'ready');
  const selected = ready.find((photo) => photo.id === selectedId) ?? primaryPhoto(records,itemId);
  const unfinished = records.filter((photo) => photo.upload_status === 'pending' && !tasks.some((task) => task.id === photo.id));
  const available = Math.max(0,photoLimit - records.length - tasks.filter((task) => !records.some((photo) => photo.id === task.id)).length);
  function patch(id: string, change: Partial<Task>) { if (actions.isActive()) setTasks((previous) => previous.map((task) => task.id === id ? { ...task,...change } : task)); }
  async function process(task: Task) {
    try {
      let prepared = task.prepared;
      if (!prepared) {
        patch(task.id,{ status: 'preparing', error: null });
        if (!task.asset) return;
        prepared = await preparePhoto(task.asset);
        releaseSource(task.asset); sources.current.delete(task.asset);
      }
      if (!actions.isActive()) return;
      patch(task.id,{ prepared, asset: null, status: 'uploading', error: null });
      const result = await actions.perform((service,signal) => service.upload(itemId,task.id,prepared,signal));
      if (result) setTasks((previous) => previous.filter((entry) => entry.id !== task.id));
    } catch (error) { patch(task.id,{ status: 'error', error: photoErrorMessage(error) }); }
  }
  async function exclusive(operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setFeedback(null);
    try { await operation(); } catch (error) { if (actions.isActive()) setFeedback(photoErrorMessage(error)); }
    finally { busyRef.current = false; if (actions.isActive()) setBusy(false); }
  }
  async function pick(camera: boolean) {
    if (busyRef.current) return;
    try {
      const result = await selectPhotos(camera,available);
      if (result.canceled) return;
      result.assets.forEach((asset) => sources.current.add(asset));
      if (!actions.isActive() || busyRef.current) { result.assets.forEach((asset) => { releaseSource(asset); sources.current.delete(asset); }); return; }
      if (result.assets.length > available) { result.assets.forEach((asset) => { releaseSource(asset); sources.current.delete(asset); }); setFeedback('남은 사진 슬롯 수보다 많이 선택했습니다. 최대 5장까지 선택해 주세요.'); return; }
      await exclusive(async () => {
        const jobs: Task[] = result.assets.map((asset) => ({ id: randomUUID(), asset, prepared: null, status: 'preparing', error: null }));
        setTasks((previous) => [...previous,...jobs]);
        for (const task of jobs) { if (!actions.isActive()) break; await process(task); }
      });
    } catch (error) { if (actions.isActive()) setFeedback(photoErrorMessage(error)); }
  }
  async function remove(id: string) {
    if (!await confirmPhotoRemoval()) return;
    await exclusive(async () => {
      const result = await actions.perform((service,signal) => service.remove(id,signal));
      if (result) {
        const task = tasks.find((entry) => entry.id === id);
        if (task?.asset) { releaseSource(task.asset); sources.current.delete(task.asset); }
        setTasks((previous) => previous.filter((entry) => entry.id !== id));
      }
    });
  }
  return <View style={{ gap: 16, width: '100%' }}>
    <PhotoFrame naturalAspect photo={selected} loading={query.isPending} error={query.isError} retry={() => { void query.refetch(); }} />
    {query.isError && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: colors.muted }}>{photoErrorMessage(query.error)}</Text><ActionButton variant="secondary" label="사진 새로고침" onPress={() => { void query.refetch(); }} /></View>}
    <Text style={{ color: colors.muted, fontSize: 12 }}>사진 {ready.length}/5 · 업로드 전 최대 2048px로 변환 · 장당 5MiB</Text>
    {ready.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{ready.map((photo,index) => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`사진 ${index + 1} 선택${photo.is_primary ? ' (대표)' : ''}`} aria-pressed={selected?.id === photo.id} onPress={() => setSelectedId(photo.id)} style={{ width: 64, borderWidth: 2, borderColor: selected?.id === photo.id ? colors.primary : colors.border, borderRadius: 10, padding: 2 }}><PhotoFrame photo={photo} /></Pressable>)}</View>}
    {selected && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><ActionButton variant="secondary" label={selected.is_primary ? '대표 사진' : '대표 사진으로 지정'} disabled={busy || selected.is_primary} onPress={() => { void exclusive(async () => { await actions.perform((service,signal) => service.setPrimary(selected.id,signal)); }); }} /><ActionButton variant="secondary" label="선택 사진 삭제" disabled={busy} onPress={() => { void remove(selected.id); }} /></View>}
    {canUpload && <><ActionButton label="사진 선택" disabled={busy || query.isPending || query.isError || available === 0} onPress={() => { void pick(false); }} />{Platform.OS !== 'web' && <ActionButton variant="secondary" label="카메라로 촬영" disabled={busy || query.isPending || query.isError || available === 0} onPress={() => { void pick(true); }} />}</>}
    {!canUpload && <Text style={{ color: colors.muted }}>보관·판매·기부한 옷에는 새 사진을 추가할 수 없습니다.</Text>}
    {tasks.map((task,index) => <View key={task.id} style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}><Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>사진 작업 {index + 1} · {task.status === 'preparing' ? '변환 중…' : task.status === 'uploading' ? '업로드 중…' : '다시 시도 필요'}</Text>{task.error && <Text accessibilityRole="alert" style={{ color: '#A52727', lineHeight: 22 }}>{task.error}</Text>}{task.status === 'error' && <View style={{ gap: 8 }}><ActionButton variant="secondary" label="업로드 다시 시도" disabled={busy} onPress={() => { void exclusive(() => process(task)); }} /><ActionButton variant="secondary" label="이 작업 정리" disabled={busy} onPress={() => { void remove(task.id); }} /></View>}</View>)}
    {unfinished.map((photo) => <View key={photo.id} style={{ gap: 8, padding: 12, backgroundColor: colors.surface, borderRadius: 10 }}><Text style={{ color: colors.muted, lineHeight: 22 }}>완료되지 않은 사진이 있습니다. 파일이 올라갔다면 마무리할 수 있습니다.</Text><ActionButton variant="secondary" label="업로드 마무리" disabled={busy} onPress={() => { void exclusive(async () => { await actions.perform((service,signal) => service.complete(photo.id,signal)); }); }} /><ActionButton variant="secondary" label="미완료 사진 정리" disabled={busy} onPress={() => { void remove(photo.id); }} /></View>)}
    {feedback && <Text accessibilityRole="alert" style={{ color: '#A52727', lineHeight: 22 }}>{feedback}</Text>}
  </View>;
}
