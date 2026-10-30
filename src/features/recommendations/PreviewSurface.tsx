import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '@/theme/useTheme';
import { slotLabels } from '../outfits/draft';
import { recommendationSlots } from './engine';
import { mannequinSampleSvg } from './artwork';
import type { CaptureView, RenderRequest } from './renderModel';

export type PreviewHandle = NonNullable<RenderRequest['targets']>;
type Props = Pick<RenderRequest, 'name' | 'items' | 'photos' | 'mode' | 'preset'>;
export const PreviewSurface = forwardRef<PreviewHandle, Props>(function PreviewSurface(props, ref) {
  const colors = useTheme(); const itemsRef = useRef<CaptureView | null>(null); const mannequinRef = useRef<CaptureView | null>(null);
  const loaded = useRef(new Set<string>()); const waiting = useRef(new Set<{ check: () => void; cancel: () => void }>());
  const [failed, setFailed] = useState<Set<string>>(new Set()); const [sampleFailed, setSampleFailed] = useState(false);
  const imageKey = (id: string, uri: string) => `${props.mode}:${id}:${uri}`;
  const expected = props.photos.filter((photo) => Object.values(props.items).some((item) => item?.id === photo.itemId)).map((photo) => imageKey(photo.itemId, photo.uri));
  function settled(key: string) { loaded.current.add(key); waiting.current.forEach((listener) => listener.check()); }
  function waitForImages() {
    if (expected.every((key) => loaded.current.has(key))) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timeout); waiting.current.delete(listener); if (error) reject(error); else resolve(); };
      const listener = { check: () => { if (expected.every((key) => loaded.current.has(key))) finish(); }, cancel: () => finish(new Error('render_cancelled')) };
      const timeout = setTimeout(() => finish(new Error('photo_timeout')), 15_000); waiting.current.add(listener); listener.check();
    });
  }
  useImperativeHandle(ref, () => ({ items: itemsRef, mannequin: mannequinRef, waitForImages }));
  useEffect(() => { const listeners = waiting.current; return () => { listeners.forEach((listener) => listener.cancel()); }; }, []);
  const board = <View ref={itemsRef} collapsable={false} style={{ width: '100%', aspectRatio: 900 / 1100, padding: 10, backgroundColor: '#F5F7FB', gap: 8 }}>
    <Text style={{ color: '#3047D5', fontSize: 9, letterSpacing: 1 }}>CLOSET / MY REAL WARDROBE</Text><Text numberOfLines={1} style={{ color: '#222530', fontWeight: '700', fontSize: 14 }}>{props.name}</Text>
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
      {recommendationSlots.map((slot) => {
        const item = props.items[slot]; const photo = item ? props.photos.find((entry) => entry.itemId === item.id) : null; const key = photo ? imageKey(photo.itemId, photo.uri) : '';
        return <View key={slot} style={{ width: '32%', height: '48%', padding: 5, gap: 4, borderWidth: 1, borderColor: '#E0E5EE', borderRadius: 6, backgroundColor: '#FFFFFF' }}>
          <Text style={{ color: '#3047D5', fontSize: 10, fontWeight: '700' }}>{slotLabels[slot]}</Text>
          <View style={{ flex: 1, backgroundColor: '#F5F6F9', borderRadius: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {photo && !failed.has(key) ? <Image key={key} accessibilityLabel={item!.name} source={{ uri: photo.uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onLoadEnd={() => settled(key)} onError={() => { settled(key); setFailed((old) => new Set(old).add(key)); }} /> : <Text style={{ color: '#7C818E', fontSize: 9, textAlign: 'center', padding: 3 }}>{item ? photo ? '사진 확인 불가' : '사진 미등록' : '추천 제외'}</Text>}
          </View>
          <Text numberOfLines={2} style={{ color: '#222530', fontSize: 10, lineHeight: 14, minHeight: 28 }}>{item?.name ?? '보유 목록에 없음'}</Text>
        </View>;
      })}
    </View>
    <Text style={{ color: '#667083', fontSize: 8 }}>실제 보유 의류 · 원본 사진 비율 유지</Text>
  </View>;
  const sample = <View ref={mannequinRef} collapsable={false} style={{ width: '100%', aspectRatio: 900 / 1100, backgroundColor: '#EEF1F6' }}>
    <SvgXml xml={mannequinSampleSvg(props.preset, props.items)} width="100%" height="100%" onError={() => setSampleFailed(true)} />
  </View>;
  const effectiveSample = props.mode === 'mannequin' && !sampleFailed;
  return <View style={{ gap: 8, width: '100%' }}>
    <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>{effectiveSample ? sample : board}</View>
    {props.mode === 'mannequin' && <Text style={{ color: colors.primary, fontSize: 11, lineHeight: 19, textAlign: 'center' }}>{sampleFailed ? '샘플을 표시하지 못해 실제 의류 나열형으로 돌아왔어요.' : '샘플 마네킹 · 색상과 체형을 참고하는 프로토타입입니다. 실제 제품 착용 이미지가 아닙니다.'}</Text>}
    {Platform.OS !== 'web' && effectiveSample && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10_000, width: 360 }}>{board}</View>}
  </View>;
});
