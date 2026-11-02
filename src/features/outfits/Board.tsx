import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { primaryPhoto, type PrivatePhoto } from '../wardrobe/photos/model';
import type { Category, WardrobeItem } from '../wardrobe/types';
import { selectionProblem, slotDisplayLabel, slotItemIds, draftItemIds, isLayeredSlot, slots, type OutfitDraft, type OutfitSlot } from './draft';
import { OutfitControl } from './EditorControls';

type Props = { draft: OutfitDraft; owner: string; items: WardrobeItem[]; categories: Category[]; photos: PrivatePhoto[]; checking: boolean; failed: boolean; photoLoading: boolean; photoFailed: boolean; busy: boolean; activeSlot: OutfitSlot; activePosition: number; onChoose: (slot: OutfitSlot, position?: number) => void; onRemove: (slot: OutfitSlot, position: number) => void; onMove: (slot: OutfitSlot, from: number, to: number) => void };
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
    const ids = slotItemIds(props.draft, slot);
    const label = slotDisplayLabel(slot, props.categories);
    const layered = ids.length > 1;
    const active = props.activeSlot === slot;
    return <View key={slot} style={{ width: tileWidth, padding: 10, gap: 8, borderWidth: 1, borderRadius: 10, borderColor: active ? colors.primary : colors.border, backgroundColor: colors.background }}>
      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 13, fontWeight: '700', minHeight: 24 }}>{label}{layered ? ` · ${ids.length}벌` : ''}</Text>
      {(ids.length ? ids : [undefined]).map((id, position) => {
        const item = props.items.find(row => row.id === id);
        const problem = id && !props.checking && !props.failed ? selectionProblem(item, slot, props.owner, props.categories) : null;
        const selected = active && props.activePosition === position;
        const height = layered ? 110 : imageHeight;
        return <View key={id ?? 'empty'} style={{ gap: 5, paddingTop: layered ? 6 : 0, borderTopWidth: layered ? 1 : 0, borderColor: colors.border }}>
          {id && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
            <Text style={{ color: selected ? colors.primary : colors.muted, fontSize: 11, flex: 1 }}>{isLayeredSlot(slot) ? `${position + 1} · ${position === 0 ? '안쪽' : position === ids.length - 1 ? '바깥쪽' : '중간'}` : '선택한 옷'}</Text>
            <OutfitControl label={layered ? `${label} ${position + 1}번째 옷 제거` : `${label} 제거`} icon="close" iconOnly variant="quiet" disabled={props.busy} onPress={() => props.onRemove(slot, position)} style={{ marginRight: -7 }} />
          </View>}
          <Pressable accessibilityRole="button" accessibilityLabel={`${label}${layered ? ` ${position + 1}번째` : ' 슬롯'} ${id ? '교체' : '선택'}`} accessibilityState={{ disabled: props.busy, selected }} disabled={props.busy} onPress={() => props.onChoose(slot, position)} style={{ gap: 6 }}>
            {id ? <PhotoFrame photo={primaryPhoto(props.photos, id)} loading={props.checking || props.photoLoading} error={props.failed || props.photoFailed} aspectRatio={imageWidth / height} borderRadius={6} /> : <View style={{ width: '100%', height, borderRadius: 6, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="plus" size={22} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12 }}>{label} 선택</Text></View>}
            <Text numberOfLines={2} style={{ color: id ? colors.text : colors.muted, fontSize: 12, lineHeight: 18, minHeight: 36 }}>{id ? item?.name ?? (props.checking ? '옷 확인 중…' : '사용할 수 없는 옷') : '선택한 옷이 없어요'}</Text>
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>{id ? item?.brand_name || '브랜드 미입력' : '눌러서 옷을 골라주세요'}</Text>
          </Pressable>
          {layered && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 }}>
            <OutfitControl label={`${label} ${position + 1}번째 옷 안쪽으로`} icon="up" iconOnly variant="quiet" disabled={props.busy || position === 0} onPress={() => props.onMove(slot, position, position - 1)} />
            <OutfitControl label={`${label} ${position + 1}번째 옷 바깥쪽으로`} icon="down" iconOnly variant="quiet" disabled={props.busy || position === ids.length - 1} onPress={() => props.onMove(slot, position, position + 1)} />
          </View>}
          {problem && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12, lineHeight: 18 }}>{problem}</Text>}
        </View>;
      })}
      {isLayeredSlot(slot) && ids.length > 0 && ids.length < 3 && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 겹쳐 입기 추가`} accessibilityState={{ disabled: props.busy }} disabled={props.busy} onPress={() => props.onChoose(slot, ids.length)} style={({ pressed }) => ({ minHeight: 44, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', opacity: props.busy ? 0.5 : pressed ? 0.7 : 1 })}><Text style={{ color: colors.primary, fontSize: 12 }}>+ 겹쳐 입기 추가</Text></Pressable>}
      {isLayeredSlot(slot) && layered && <Text style={{ color: colors.muted, fontSize: 11 }}>위: 안쪽 · 아래: 바깥쪽</Text>}
    </View>;
  }
  return <View style={{ width: '100%' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: colors.border }}><Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>코디 보드</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{draftItemIds(props.draft).length}개 선택</Text></View>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ margin: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{width > 0 && slots.slice(0, 4).map(tile)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="추가 슬롯" accessibilityState={{ expanded: extra, disabled: props.busy }} aria-expanded={extra} disabled={props.busy} onPress={() => setExtra(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 7 }}><Icon name="bag" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, flexShrink: 1 }}>{extraSlots.map(slot => slotDisplayLabel(slot, props.categories)).join(' · ')}{extraCount ? ` · ${extraCount}개 선택` : ''}</Text></View><Icon name={extra ? 'up' : 'plus'} size={16} color={colors.muted} /></Pressable>
      {extra && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{width > 0 && extraSlots.map(tile)}</View>}
    </View>
  </View>;
}
