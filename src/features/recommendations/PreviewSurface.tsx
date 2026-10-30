import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { slotLabels } from '../outfits/draft';
import { flatlayPlacements, flatlaySize } from './flatlay';
import { useFlatlayPhotos } from './useFlatlayPhotos';
import type { CaptureView, RenderRequest } from './renderModel';

export type PreviewHandle = NonNullable<RenderRequest['targets']>;
type Props = Pick<RenderRequest, 'name' | 'items' | 'photos'>;
export const PreviewSurface = forwardRef<PreviewHandle, Props>(function PreviewSurface(props, ref) {
  const itemsRef = useRef<CaptureView | null>(null); const prepared = useFlatlayPhotos(props.photos);
  const loaded = useRef(new Set<string>()); const waiting = useRef(new Set<{ check: () => void; cancel: () => void }>());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const imageKey = (id: string, uri: string) => `${id}:${props.photos.find((photo) => photo.itemId === id)?.uri.split('?')[0]}:${uri.startsWith('data:') ? 'cutout' : 'original'}`;
  const latest = useRef({ preparing: true, expected: [] as string[] });
  latest.current = { preparing: prepared.preparing, expected: prepared.photos.filter((photo) => Object.values(props.items).some((item) => item?.id === photo.itemId)).map((photo) => imageKey(photo.itemId, photo.uri)) };
  function settled(key: string) { loaded.current.add(key); waiting.current.forEach((listener) => listener.check()); }
  function ready() { return !latest.current.preparing && latest.current.expected.every((key) => loaded.current.has(key)); }
  function waitForImages() {
    if (ready()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timeout); waiting.current.delete(listener); if (error) reject(error); else resolve(); };
      const listener = { check: () => { if (ready()) finish(); }, cancel: () => finish(new Error('render_cancelled')) };
      const timeout = setTimeout(() => finish(new Error('photo_timeout')), 20_000); waiting.current.add(listener); listener.check();
    });
  }
  useImperativeHandle(ref, () => ({ items: itemsRef, waitForImages }));
  useEffect(() => { waiting.current.forEach((listener) => listener.check()); });
  useEffect(() => { const listeners = waiting.current; return () => { listeners.forEach((listener) => listener.cancel()); }; }, []);
  return <View style={{ width: '100%', gap: 8 }}>
    <View ref={itemsRef} testID="flatlay-preview" collapsable={false} accessibilityLabel={`${props.name} 플랫레이`} style={{ width: '100%', aspectRatio: flatlaySize.width / flatlaySize.height, backgroundColor: flatlaySize.background, overflow: 'hidden', borderRadius: 10 }}>
      {flatlayPlacements(props.items).map(({ slot, x, y, width, height, rotation }) => {
        const item = props.items[slot]!; const photo = prepared.photos.find((entry) => entry.itemId === item.id); const key = photo ? imageKey(photo.itemId, photo.uri) : '';
        return <View key={slot} style={{ position: 'absolute', left: `${x / 9}%`, top: `${y / 11}%`, width: `${width / 9}%`, height: `${height / 11}%`, transform: [{ rotate: `${rotation}deg` }], justifyContent: 'center', alignItems: 'center' }}>
          {photo && !failed.has(key) ? <Image key={key} accessibilityLabel={item.name} source={{ uri: photo.uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onLoadEnd={() => settled(key)} onError={() => { settled(key); setFailed((old) => new Set(old).add(key)); }} /> : !prepared.preparing && <Text style={{ color: '#7C818E', fontSize: 10, textAlign: 'center' }}>{slotLabels[slot]} · {photo ? '사진 확인 불가' : '사진 미등록'}</Text>}
        </View>;
      })}
      {prepared.preparing && <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: flatlaySize.background }}><ActivityIndicator color="#3047D5" accessibilityLabel="플랫레이 사진 준비 중" /></View>}
    </View>
    <Text style={{ color: '#7C818E', fontSize: 11, lineHeight: 18 }}>실제 보유 의류 사진 · 플랫레이</Text>
  </View>;
});
