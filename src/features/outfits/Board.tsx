import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { primaryPhoto, type PrivatePhoto } from '../wardrobe/photos/model';
import type { Category, WardrobeItem } from '../wardrobe/types';
import { selectionProblem, slotDisplayLabel, slots, type OutfitDraft, type OutfitSlot } from './draft';
import { OutfitControl } from './EditorControls';

type Props = { draft: OutfitDraft; owner: string; items: WardrobeItem[]; categories: Category[]; photos: PrivatePhoto[]; checking: boolean; failed: boolean; photoLoading: boolean; photoFailed: boolean; busy: boolean; activeSlot: OutfitSlot; onChoose: (slot: OutfitSlot) => void; onRemove: (slot: OutfitSlot) => void };
export function OutfitBoard(props: Props) {
  const colors = useTheme();
  const [width, setWidth] = useState(0);
  const [extra, setExtra] = useState(false);
  // Retain an existing legacy slot, but do not offer it for new outfits.
  const extraSlots = slots.slice(4).filter(slot => slot !== 'onepiece' || props.draft.items.onepiece);
  const extraCount = extraSlots.filter(slot => props.draft.items[slot]).length;
  const tileWidth = Math.max(0, Math.floor((width - 12) / 2));
  const imageWidth = Math.max(1, tileWidth - 22);
  const imageHeight = Math.min(170, Math.max(140, imageWidth * 0.55));
  function tile(slot: OutfitSlot) {
    const id = props.draft.items[slot];
    const item = props.items.find(row => row.id === id);
    const label = slotDisplayLabel(slot, props.categories);
    const problem = id && !props.checking && !props.failed ? selectionProblem(item, slot, props.owner, props.categories) : null;
    const active = props.activeSlot === slot;
    return <View key={slot} style={{ width: tileWidth, padding: 10, borderWidth: 1, borderRadius: 10, borderColor: problem ? '#A52727' : active ? colors.primary : colors.border, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, marginBottom: 6 }}>
        <Text numberOfLines={1} style={{ color: active ? colors.primary : colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{label}</Text>
        {id && <OutfitControl label={`${label} 제거`} icon="close" iconOnly variant="quiet" disabled={props.busy} onPress={() => props.onRemove(slot)} style={{ marginRight: -7, marginVertical: -4 }} />}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 슬롯 ${id ? '교체' : '선택'}`} accessibilityState={{ disabled: props.busy, selected: active }} disabled={props.busy} onPress={() => props.onChoose(slot)} style={{ gap: 8 }}>
        {id ? <PhotoFrame photo={primaryPhoto(props.photos, id)} loading={props.checking || props.photoLoading} error={props.failed || props.photoFailed} aspectRatio={imageWidth / imageHeight} borderRadius={6} /> : <View style={{ width: '100%', height: imageHeight, borderRadius: 6, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="plus" size={22} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12 }}>{label} 선택</Text></View>}
        <Text numberOfLines={2} style={{ color: id ? colors.text : colors.muted, fontSize: 12, lineHeight: 18, minHeight: 36 }}>{id ? item?.name ?? (props.checking ? '옷 확인 중…' : '사용할 수 없는 옷') : '선택한 옷이 없어요'}</Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, minHeight: 16 }}>{id ? item?.brand_name || '브랜드 미입력' : '슬롯을 눌러 옷을 골라주세요'}</Text>
      </Pressable>
      {problem && <Text accessibilityRole="alert" style={{ color: '#A52727', fontSize: 12, lineHeight: 18, marginTop: 8 }}>{problem}</Text>}
    </View>;
  }
  return <View style={{ width: '100%' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: colors.border }}><Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>코디 보드</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{Object.keys(props.draft.items).length}개 선택</Text></View>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ margin: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{width > 0 && slots.slice(0, 4).map(tile)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="추가 슬롯" accessibilityState={{ expanded: extra, disabled: props.busy }} aria-expanded={extra} disabled={props.busy} onPress={() => setExtra(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 7 }}><Icon name="bag" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, flexShrink: 1 }}>{extraSlots.map(slot => slotDisplayLabel(slot, props.categories)).join(' · ')}{extraCount ? ` · ${extraCount}개 선택` : ''}</Text></View><Icon name={extra ? 'up' : 'plus'} size={16} color={colors.muted} /></Pressable>
      {extra && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{width > 0 && extraSlots.map(tile)}</View>}
    </View>
  </View>;
}
