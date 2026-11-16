import { Fragment, forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { slotLabels } from '../outfits/draft';
import { flatlayPalette, flatlayPlacements, flatlaySize, flatlayStops, flatlaySwatch } from './flatlay';
import { useFlatlayPhotos } from './useFlatlayPhotos';
import { renderEntries, renderItem, type CaptureView, type RenderRequest } from './renderModel';

export type PreviewHandle = NonNullable<RenderRequest['targets']>;
type Props = Pick<RenderRequest, 'name' | 'items' | 'layers' | 'photos'> & { loading?: boolean };
export const PreviewSurface = forwardRef<PreviewHandle, Props>(function PreviewSurface(props, ref) {
  const itemsRef = useRef<CaptureView | null>(null); const prepared = useFlatlayPhotos(props.photos);
  const loaded = useRef(new Set<string>()); const waiting = useRef(new Set<{ check: () => void; cancel: () => void }>());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const gradientId = `flatlay-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const imageKey = (id: string, uri: string) => `${id}:${props.photos.find((photo) => photo.itemId === id)?.uri.split('?')[0]}:${uri.startsWith('data:') ? 'cutout' : 'original'}`;
  const latest = useRef({ preparing: true, expected: [] as string[] });
  const entries = renderEntries(props);
  const preparing = Boolean(props.loading || prepared.preparing);
  latest.current = { preparing, expected: prepared.photos.filter((photo) => entries.some(({ item }) => item.id === photo.itemId)).map((photo) => imageKey(photo.itemId, photo.uri)) };
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
  const photosById = new Map(prepared.photos.map((photo) => [photo.itemId, photo]));
  const palette = flatlayPalette(props.items, props.layers);
  const canvas = `0 0 ${flatlaySize.width} ${flatlaySize.height}`;
  const { x: chipX, y: chipY, width: chipWidth, height: chipHeight, gap } = flatlaySwatch;
  return <View ref={itemsRef} testID="flatlay-preview" collapsable={false} accessibilityLabel={[`${props.name} 플랫레이`, ...palette.map(({ label }) => label)].join(' · ')} style={{ width: '100%', aspectRatio: flatlaySize.width / flatlaySize.height, backgroundColor: flatlaySize.background, overflow: 'hidden', borderRadius: 10 }}>
    <Svg pointerEvents="none" width="100%" height="100%" viewBox={canvas} style={{ position: 'absolute' }}>
      <Defs><LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor={flatlayStops[0]} />
        <Stop offset="48%" stopColor={flatlayStops[1]} />
        <Stop offset="100%" stopColor={flatlayStops[2]} />
      </LinearGradient></Defs>
      <Rect width={flatlaySize.width} height={flatlaySize.height} fill={`url(#${gradientId})`} />
    </Svg>
    {flatlayPlacements(props.items, props.layers, photosById).map(({ slot, position, x, y, width, height, rotation }) => {
      const item = renderItem(props, slot, position);
      const photo = photosById.get(item.id);
      const key = photo ? imageKey(photo.itemId, photo.uri) : '';
      const shadow = photo && !photo.framed && Platform.OS === 'web'
        ? { filter: 'drop-shadow(2px 4px 4px rgba(32,32,36,0.29))' } as ViewStyle
        : undefined;
      return <View key={`${slot}:${position}`} style={{ position: 'absolute', left: `${x / flatlaySize.width * 100}%`, top: `${y / flatlaySize.height * 100}%`, width: `${width / flatlaySize.width * 100}%`, height: `${height / flatlaySize.height * 100}%`, transform: [{ rotate: `${rotation}deg` }], justifyContent: 'center', alignItems: 'center', ...shadow }}>
        {photo && !failed.has(key) ? <Image key={key} accessibilityLabel={item.name} source={{ uri: photo.uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onLoadEnd={() => settled(key)} onError={() => { settled(key); setFailed((old) => new Set(old).add(key)); }} /> : !preparing && <Text style={{ color: '#393A40', fontSize: 10, textAlign: 'center' }}>{slotLabels[slot]} · {photo ? '사진 확인 불가' : '사진 미등록'}</Text>}
      </View>;
    })}
    <Svg pointerEvents="none" width="100%" height="100%" viewBox={canvas} style={{ position: 'absolute' }}>
      {palette.map(({ hex, label }, index) => {
        const top = chipY + index * (chipHeight + gap);
        return <Fragment key={hex}>
          <Rect x={chipX} y={top} width={chipWidth} height={chipHeight} rx={2} fill="#F5F3EF" />
          <Rect x={chipX + 5} y={top + 5} width={chipWidth - 10} height={69} rx={1} fill={hex} />
          <SvgText x={chipX + chipWidth / 2} y={top + 92} fill="#242428" textAnchor="middle" fontSize={12} fontWeight="700">{label.slice(0, 9)}</SvgText>
        </Fragment>;
      })}
    </Svg>
    {preparing && <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: flatlaySize.background }}><ActivityIndicator color="#3047D5" accessibilityLabel="플랫레이 사진 준비 중" /></View>}
  </View>;
});
