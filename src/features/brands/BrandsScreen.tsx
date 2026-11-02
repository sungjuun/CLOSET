import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { usePreventRemove } from 'expo-router';
import { GuardedLink as Link, useAppNavigationBlocker } from '@/providers/NavigationGuard';
import { Modal, Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/useTheme';
import { WardrobeHeader, WardrobeState } from '../wardrobe/components';
import { selectPhotos } from '../wardrobe/photos/picker';
import { preparePhoto, releaseSource } from '../wardrobe/photos/prepare';
import { photoErrorMessage, type PreparedImage } from '../wardrobe/photos/model';
import { brandErrorMessage, brandNameSchema, filterBrands, type Brand } from './model';
import { useBrandActions, useBrandImages, useBrands } from './hooks';
import { BrandLogo } from './BrandLogo';

export function BrandsScreen() {
  const colors = useTheme();
  const query = useBrands();
  const actions = useBrandActions();
  const [base, setBase] = useState<Brand | null>(null);
  const [requestId, setRequestId] = useState(() => randomUUID());
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageTask, setImageTask] = useState<{ id: string; image: PreparedImage; asset: ImagePickerAsset } | null>(null);
  useEffect(() => { return () => { if (imageTask) releaseSource(imageTask.asset); }; }, [imageTask]);
  const [confirm, setConfirm] = useState<'discard' | 'remove' | 'leave' | null>(null);
  const [deletion, setDeletion] = useState<Brand | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [cleanupTargets, setCleanupTargets] = useState<Brand[]>([]);
  const leave = useRef<() => void>(() => {});
  const results = filterBrands(query.data ?? [], search);
  const lastPage = Math.max(0, Math.ceil(results.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = results.slice(currentPage * 20, (currentPage + 1) * 20);
  const images = useBrandImages(base ? [...rows, base] : rows);
  const dirty = name !== (base?.name ?? '') || imageTask !== null;
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => { leave.current = repeat; setConfirm('leave'); });
  useAppNavigationBlocker(dirty, (proceed) => { leave.current = () => { disablePrevention(); proceed(); }; setConfirm('leave'); });
  function reset() { setBase(null); setName(''); setImageTask(null); setRequestId(randomUUID()); setMessage(null); setConfirm(null); }
  function editBrand(brand: Brand) {
    if (busy || dirty) return;
    setBase(brand); setName(brand.name); setImageTask(null); setMessage(null); setConfirm(null);
  }
  function askDelete(brand: Brand) {
    if (busy || dirty) return;
    setDeleteError(null); setDeletion(brand);
  }
  async function exclusive(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(null);
    try { await operation(); } catch (error) { if (actions.isActive()) setMessage(brandErrorMessage(error)); }
    finally { lock.current = false; if (actions.isActive()) setBusy(false); }
  }
  async function save() {
    const parsed = brandNameSchema.safeParse(name);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? '브랜드명을 확인해 주세요.'); return; }
    await exclusive(async () => {
      const saved = await actions.perform((service, signal) => service.save(base?.id ?? requestId, parsed.data, base?.updated_at, signal));
      if (!saved) return;
      setBase(saved.value); setName(saved.value.name);
      if (imageTask) {
        try {
          const uploaded = await actions.perform((service, signal) => service.upload(saved.value, imageTask.id, imageTask.image, signal));
          if (!uploaded) return;
          setBase(uploaded.value.brand); setImageTask(null);
          setMessage(uploaded.value.cleanupPending ? '브랜드와 이미지는 저장했습니다. 이전 이미지 파일 정리는 완료되지 않았습니다.' : '브랜드와 이미지를 저장했습니다. 옷 등록 화면에서 선택할 수 있습니다.');
        } catch (error) { if (actions.isActive()) setMessage(`브랜드명은 저장했습니다. 이미지 저장을 다시 시도해 주세요. ${brandErrorMessage(error)}`); }
      } else setMessage('브랜드를 저장했습니다. 옷 등록 화면에서 선택할 수 있습니다.');
    });
  }
  async function pick() {
    if (lock.current) return;
    // Start the picker synchronously from the user's press for web activation.
    const promise = selectPhotos(false, 1);
    await exclusive(async () => {
      const result = await promise;
      if (result.canceled) return;
      let retained = false;
      try {
        if (result.assets.length !== 1 || !result.assets[0]) { if (actions.isActive()) setMessage('이미지는 한 장만 선택해 주세요.'); return; }
        try {
          const image = await preparePhoto(result.assets[0], { square: true });
          if (actions.isActive()) { retained = true; setImageTask({ id: randomUUID(), image, asset: result.assets[0] }); setMessage('이미지를 선택했습니다. 브랜드 저장을 눌러 적용해 주세요.'); }
        } catch (error) { if (actions.isActive()) setMessage(photoErrorMessage(error)); }
      } finally { if (!retained) result.assets.forEach(releaseSource); }
    });
  }
  async function removeImage() {
    if (!base) return;
    setConfirm(null);
    await exclusive(async () => {
      const result = await actions.perform((service, signal) => service.removeImage(base, signal));
      if (result) { setBase(result.value.brand); setImageTask(null); setMessage(result.value.cleanupPending ? '이미지 연결을 해제했습니다. 이전 파일 정리는 완료되지 않았습니다.' : '브랜드 이미지를 삭제했습니다.'); }
    });
  }
  async function removeBrand(target: Brand | null = base) {
    if (!target) return;
    setConfirm(null);
    setDeleteError(null);
    await exclusive(async () => {
      let result;
      try { result = await actions.perform((service, signal) => service.remove(target, signal)); }
      catch (cause) { if (actions.isActive()) setDeleteError(brandErrorMessage(cause)); throw cause; }
      if (!result) return;
      if (base?.id === target.id) reset();
      setDeletion(null);
      setCleanupTargets((previous) => [...previous.filter((entry) => entry.id !== target.id), ...(result.value.cleanupPending ? [result.value.brand] : [])]);
      setMessage(result.value.cleanupPending ? '브랜드를 삭제하고 옷의 브랜드 연결을 해제했습니다. 이미지 파일 정리가 남아 있어요. 아래 버튼으로 다시 시도해 주세요.' : '브랜드를 삭제했습니다. 기존 옷과 사진은 그대로 유지됩니다.');
    });
  }
  return <View style={{ maxWidth: 960, width: '100%', alignSelf: 'center', gap: 24 }}>
    <Link href="/settings" style={{ color: colors.primary, paddingVertical: 10 }}>← 설정</Link>
    <WardrobeHeader title="브랜드 관리" description="브랜드명과 이미지를 등록해 두고 옷을 추가할 때 선택하세요." />
    <View style={{ padding: 20, gap: 16, backgroundColor: colors.surface, borderRadius: 12 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{base ? '브랜드 수정' : '브랜드 등록'}</Text>
      <FormField label="브랜드명 *" value={name} onChangeText={setName} maxLength={120} editable={!busy} />
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}><BrandLogo name={name} url={imageTask?.asset.uri ?? (base?.image_path ? images.data?.[base.image_path] : undefined)} size={80} /><View style={{ gap: 8, flex: 1, minWidth: 180 }}><ActionButton variant="secondary" label={imageTask ? '선택 이미지 바꾸기' : '브랜드 이미지 선택'} disabled={busy} onPress={() => { void pick(); }} /><Text style={{ color: colors.muted, fontSize: 12 }}>{imageTask ? '새 이미지 선택 완료 · 미리보기를 확인하고 저장해 주세요.' : '이미지는 선택 사항입니다. JPEG·PNG·WebP, 변환 후 5MiB 이하'}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>이미지를 중앙 기준 정사각형으로 자동 맞춥니다. 가장자리가 잘릴 수 있어요.</Text></View></View>
      {imageTask && <ActionButton variant="secondary" label="새 이미지 선택 취소" disabled={busy} onPress={() => setImageTask(null)} />}
      {base?.image_path && !imageTask && <ActionButton variant="secondary" label="등록 이미지 삭제" disabled={busy} onPress={() => setConfirm('remove')} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><ActionButton label="브랜드 저장" loading={busy} onPress={() => { void save(); }} /><ActionButton variant="secondary" label="새 브랜드 입력" disabled={busy} onPress={() => { if (dirty) setConfirm('discard'); else reset(); }} /></View>
      {base && <Text style={{ color: colors.muted, lineHeight: 22 }}>브랜드명을 바꾸면 연결된 옷에도 반영됩니다.</Text>}
      {confirm && <View style={{ gap: 12 }}><Text style={{ color: colors.text }}>{confirm === 'remove' ? '등록한 브랜드 이미지를 삭제할까요?' : confirm === 'leave' ? '저장하지 않은 브랜드명과 이미지 선택을 버리고 이동할까요?' : '저장하지 않은 입력을 버리고 새 브랜드를 입력할까요?'}</Text><ActionButton variant="secondary" label="계속 편집" disabled={busy} onPress={() => setConfirm(null)} /><ActionButton label={confirm === 'remove' ? '이미지 삭제' : confirm === 'leave' ? '입력 버리고 이동' : '입력 버리기'} disabled={busy} onPress={() => { if (confirm === 'remove') void removeImage(); else if (confirm === 'leave') { reset(); leave.current(); } else reset(); }} /></View>}
      {message && <Text accessibilityLiveRegion="polite" style={{ color: colors.text, lineHeight: 24 }}>{message}</Text>}
    </View>
    {cleanupTargets.map((target) => <ActionButton key={target.id} variant="secondary" label={`${target.name} 삭제 이미지 정리 다시 시도`} disabled={busy} onPress={() => { void removeBrand(target); }} />)}
    <FormField label="등록 브랜드 검색" value={search} maxLength={120} onChangeText={(text) => { setSearch(text); setPage(0); }} />
    <ActionButton variant="secondary" label="브랜드 목록 새로고침" disabled={busy || query.isFetching} onPress={() => { void query.refetch(); }} />
    {query.isPending ? <WardrobeState title="브랜드를 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="브랜드를 불러오지 못했어요" message={brandErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <>
      <Text style={{ color: colors.muted }}>{results.length}개 브랜드 · 연필로 수정하고 휴지통으로 삭제하세요.</Text>
      {rows.map((brand) => <View key={brand.id} style={{ paddingHorizontal: 12, gap: 8, minHeight: 72, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: base?.id === brand.id ? colors.primary : colors.border, borderRadius: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${brand.name} 브랜드 선택`} disabled={busy || dirty} onPress={() => editBrand(brand)} style={{ minHeight: 70, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: busy || dirty ? 0.5 : 1 }}><BrandLogo name={brand.name} url={brand.image_path ? images.data?.[brand.image_path] : undefined} /><Text style={{ color: colors.text, flex: 1, minWidth: 0 }}>{brand.name}</Text></Pressable>
        <View style={{ width: 88, flexDirection: 'row', alignItems: 'center' }}><IconButton label={`${brand.name} 수정`} icon="pencil" disabled={busy || dirty} onPress={() => editBrand(brand)} /><IconButton label={`${brand.name} 브랜드 삭제`} icon="trash" disabled={busy || dirty} onPress={() => askDelete(brand)} /></View>
      </View>)}
      {dirty && <Text style={{ color: colors.muted }}>현재 입력을 저장하거나 새 브랜드 입력에서 취소한 뒤 다른 브랜드를 선택하세요.</Text>}
      {rows.length === 0 && <Text style={{ color: colors.muted }}>{query.data.length === 0 ? '아직 등록한 브랜드가 없습니다.' : '검색 결과가 없습니다.'}</Text>}
      {results.length > 20 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ActionButton variant="secondary" label="이전" disabled={currentPage === 0 || busy} onPress={() => setPage(currentPage - 1)} /><Text style={{ color: colors.muted }}>{currentPage + 1} / {lastPage + 1}</Text><ActionButton variant="secondary" label="다음" disabled={currentPage === lastPage || busy} onPress={() => setPage(currentPage + 1)} /></View>}
    </>}
    <Modal visible={deletion !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setDeletion(null); }}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, justifyContent: 'center' }}><View accessibilityRole="dialog" accessibilityLabel="브랜드 삭제 확인" accessibilityViewIsModal style={{ width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.background, borderRadius: 16, padding: 24, gap: 16 }}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>브랜드를 삭제할까요?</Text>
      <Text style={{ color: colors.text, lineHeight: 24 }}>‘{deletion?.name}’ 브랜드를 삭제하고, 휴지통을 포함한 옷의 브랜드 연결을 해제합니다.</Text>
      <Text style={{ color: colors.muted, lineHeight: 22 }}>브랜드 로고는 삭제되며 되돌릴 수 없습니다. 옷·의류 사진·코디·착용 기록은 유지됩니다.</Text>
      {deleteError && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 22 }}>{deleteError}</Text>}
      <ActionButton label="브랜드 삭제 확인" loading={busy} onPress={() => { void removeBrand(deletion); }} />
      <ActionButton variant="secondary" label="취소" disabled={busy} onPress={() => setDeletion(null)} />
    </View></View></Modal>
  </View>;
}
