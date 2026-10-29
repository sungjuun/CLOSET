import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { primaryPhoto, type PrivatePhoto } from '../wardrobe/photos/model';
import type { Category, WardrobeItem } from '../wardrobe/types';
import { selectionProblem, slotDisplayLabel, slots, type OutfitDraft, type OutfitSlot } from './draft';

type Props = { draft: OutfitDraft; owner: string; items: WardrobeItem[]; categories: Category[]; photos: PrivatePhoto[]; checking: boolean; failed: boolean; photoLoading: boolean; photoFailed: boolean; busy: boolean; activeSlot: OutfitSlot; onChoose: (slot: OutfitSlot) => void; onRemove: (slot: OutfitSlot) => void };
export function OutfitBoard(props: Props) {
  const colors = useTheme();
  const [width, setWidth] = useState(0);
  const [extra, setExtra] = useState(false);
  const showExtra = extra;
  const extraCount = slots.slice(4).filter((slot) => props.draft.items[slot]).length;
  function tile(slot: OutfitSlot) {
    const id = props.draft.items[slot];
    const item = props.items.find((row) => row.id === id);
    const problem = id && !props.checking && !props.failed ? selectionProblem(item, slot, props.owner, props.categories) : null;
    return <View key={slot} style={{ width: Math.max(0, (width - 12) / 2), padding: 10, gap: 8, borderWidth: 2, borderRadius: 12, borderColor: problem ? '#A52727' : props.activeSlot === slot ? colors.primary : colors.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${slotDisplayLabel(slot, props.categories)} 슬롯 ${id ? '교체' : '선택'}`} disabled={props.busy} onPress={() => props.onChoose(slot)} style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{slotDisplayLabel(slot, props.categories)}</Text>
        <View style={{ width: '100%', maxWidth: 180, alignSelf: 'center' }}><PhotoFrame photo={id ? primaryPhoto(props.photos, id) : null} loading={Boolean(id && (props.checking || props.photoLoading))} error={Boolean(id && (props.failed || props.photoFailed))} /></View>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{id ? item?.name ?? (props.checking ? '옷 확인 중…' : '사용할 수 없는 옷') : '선택 안 함'}</Text>
      </Pressable>
      {problem && <Text accessibilityRole="alert" style={{ color: '#A52727', fontSize: 12, lineHeight: 18 }}>{problem}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${slotDisplayLabel(slot, props.categories)} ${id ? '교체' : '옷 선택'}`} disabled={props.busy} onPress={() => props.onChoose(slot)} style={{ minHeight: 44, flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8 }}><Text style={{ color: colors.primary, fontSize: 13 }}>{id ? '교체' : '선택'}</Text></Pressable>
        {id && <Pressable accessibilityRole="button" accessibilityLabel={`${slotDisplayLabel(slot, props.categories)} 제거`} disabled={props.busy} onPress={() => props.onRemove(slot)} style={{ minHeight: 44, flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8 }}><Text style={{ color: colors.text, fontSize: 13 }}>제거</Text></Pressable>}
      </View>
    </View>;
  }
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ gap: 16, width: '100%' }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>코디 보드</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{width > 0 && slots.slice(0, 4).map(tile)}</View>
    <Pressable accessibilityRole="button" aria-expanded={showExtra} onPress={() => setExtra((value) => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>{showExtra ? '추가 슬롯 접기 −' : `${slots.slice(4).map((slot) => slotDisplayLabel(slot, props.categories)).join('·')} 슬롯 열기 ＋${extraCount ? ` (${extraCount}개 선택)` : ''}`}</Text></Pressable>
    {showExtra && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{width > 0 && slots.slice(4).map(tile)}</View>}
  </View>;
}
