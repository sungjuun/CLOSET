import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { publicConfig } from '@/lib/config/env';
import { privateQueryKey } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { useTheme } from '@/theme/useTheme';
import { PhotoError, photoErrorMessage } from '../wardrobe/photos/model';
import { selectPhotos } from '../wardrobe/photos/picker';
import { preparePhoto, releaseSource } from '../wardrobe/photos/prepare';
import { OutfitControl } from './EditorControls';
import { createWearPhotoService } from './wearPhoto';

export function WearPhotoPanel({ owner, outfitId, disabled }: { owner: string; outfitId: string; disabled: boolean }) {
  const colors = useTheme();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const lock = useRef(false);
  if (!supabase || publicConfig.status !== 'ready') throw new PhotoError('session_changed');
  const service = createWearPhotoService(supabase, owner, outfitId, publicConfig);
  const key = privateQueryKey(owner, 'outfits', { kind: 'wear-photo', outfitId });
  const photo = useQuery({
    queryKey: key, queryFn: ({ signal }) => service.read(signal),
    gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
  });
  const url = photo.data;
  const photoFailed = Boolean(url && url === failedUrl);
  const blocked = disabled || busy || photo.isPending || photo.isError;

  async function update(remove: boolean) {
    if (blocked || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    let attempted = false;
    try {
      if (remove) {
        attempted = true;
        await service.remove();
      } else {
        const picked = await selectPhotos(false, 1);
        const asset = picked.assets?.[0];
        if (!asset) return;
        try {
          const image = await preparePhoto(asset, { jpeg: true });
          attempted = true;
          await service.save(image);
        } finally {
          releaseSource(asset);
        }
      }
      setMessage({ text: remove ? '착용 사진을 삭제했어요.' : '착용 사진을 저장했어요.' });
    } catch (error) {
      setMessage({ text: photoErrorMessage(error), error: true });
    } finally {
      // Refresh even after a lost response, since Storage may have committed the change.
      if (attempted) {
        await cache.cancelQueries({ queryKey: key, exact: true });
        setFailedUrl(null);
        await cache.invalidateQueries({ queryKey: key, exact: true });
        void cache.invalidateQueries({ queryKey: privateQueryKey(owner, 'account-usage') });
      }
      lock.current = false;
      setBusy(false);
    }
  }

  return <View testID="outfit-wear-photo" style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12, padding: 16, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>실제 착용 사진</Text>
    {url && !photoFailed && <Pressable accessibilityRole="button" accessibilityLabel="착용 사진 크게 보기" onPress={() => setExpanded(true)} style={{ width: '100%', maxWidth: 420, alignSelf: 'center', height: 280, backgroundColor: colors.surface, borderRadius: 8, overflow: 'hidden' }}>
      <Image source={{ uri: url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onError={() => setFailedUrl(url)} />
    </Pressable>}
    {(photo.isError || photoFailed) ? <View style={{ gap: 8 }}>
      <Text accessibilityRole="alert" style={{ color: colors.danger }}>착용 사진을 불러오지 못했어요.</Text>
      <OutfitControl label="사진 다시 불러오기" icon="refresh" disabled={photo.isFetching || busy} onPress={() => { setFailedUrl(null); void photo.refetch(); }} />
    </View> : !url && <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{photo.isPending ? '착용 사진을 확인하는 중…' : '직접 입은 모습을 한 장 남겨 코디 구성과 함께 보세요.'}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <OutfitControl label={url ? '사진 교체' : '착용 사진 추가'} icon={url ? 'pencil' : 'plus'} disabled={blocked} loading={busy} onPress={() => { void update(false); }} />
      {url && <OutfitControl label="착용 사진 삭제" icon="trash" iconOnly disabled={blocked} onPress={() => setConfirmRemove(true)} />}
    </View>
    {message && <Text accessibilityLiveRegion="polite" style={{ color: message.error ? colors.danger : colors.muted, fontSize: 13 }}>{message.text}</Text>}
    <Modal visible={expanded && Boolean(url) && !photoFailed} animationType="fade" onRequestClose={() => setExpanded(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>실제 착용 사진</Text>
          <OutfitControl label="사진 닫기" icon="close" onPress={() => setExpanded(false)} />
        </View>
        {url && <Image accessibilityLabel="코디 착용 사진" source={{ uri: url }} resizeMode="contain" style={{ flex: 1, width: '100%' }} onError={() => { setFailedUrl(url); setExpanded(false); }} />}
      </SafeAreaView>
    </Modal>
    <Modal visible={confirmRemove} transparent animationType="fade" onRequestClose={() => setConfirmRemove(false)}>
      <View style={{ flex: 1, padding: 16, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 340, alignSelf: 'center', padding: 16, gap: 12, borderRadius: 12, backgroundColor: colors.background }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>착용 사진을 삭제할까요?</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>기기에 있는 원본 사진은 그대로 보관됩니다.</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <OutfitControl label="사진 삭제 확인" variant="primary" disabled={blocked} onPress={() => { setConfirmRemove(false); void update(true); }} />
            <OutfitControl label="취소" onPress={() => setConfirmRemove(false)} />
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}
