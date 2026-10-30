import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { FormField } from '@/components/ui/FormField';
import { useTheme } from '@/theme/useTheme';
import type { Tables } from '@/types/database.generated';
import { OutfitControl } from '../outfits/EditorControls';
import { slotLabels } from '../outfits/draft';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto } from '../wardrobe/photos/model';
import { recommendationSlots, type RecommendationOptions, type RecommendedOutfit, type RecommendationSlot } from './engine';
import { PreviewSurface, type PreviewHandle } from './PreviewSurface';
import { ImageActions } from './ImageActions';
import { useRecommendationActions } from './hooks';
import { recommendedDraft } from './service';
import type { BodyPreset, ViewMode } from './renderModel';

export function RecommendationCard({ owner, outfit, index, options, mode, preset, disabled, onBusy, onLock, onReplace }: { owner: string; outfit: RecommendedOutfit; index: number; options: RecommendationOptions; mode: ViewMode; preset: BodyPreset; disabled: boolean; onBusy: (value: boolean) => void; onLock: (slot: RecommendationSlot, id: string) => void; onReplace: (slot: RecommendationSlot) => void }) {
  const colors = useTheme(); const router = useRouter(); const actions = useRecommendationActions(owner);
  const [name, setName] = useState(`추천 코디 ${String(index + 1).padStart(2, '0')}`); const [stored, setStored] = useState<Tables<'outfits'> | null>(null);
  const storedSnapshot = useRef(''); const requestId = useRef(randomUUID()); const preview = useRef<PreviewHandle | null>(null);
  const draft = recommendedDraft(outfit, name, options); const snapshot = JSON.stringify(draft);
  const ids = Object.values(outfit.items).map((item) => item!.id); const photos = usePhotos(ids);
  const renderPhotos = ids.flatMap((id) => { const photo = primaryPhoto(photos.data ?? [], id); return photo?.signedUrl ? [{ itemId: id, uri: photo.signedUrl }] : []; });
  async function acquire(signal: AbortSignal) {
    if (stored && storedSnapshot.current === snapshot) return stored;
    const result = await actions.service.save(stored?.id ?? requestId.current, stored?.updated_at ?? null, draft, signal);
    if (actions.active()) { setStored(result); storedSnapshot.current = snapshot; }
    return result;
  }
  return <View testID="recommendation-card" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.background, overflow: 'hidden' }}>
    <View style={{ padding: 16, gap: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>LOOK {String(index + 1).padStart(2, '0')}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>종합 {outfit.score} · 색상 {outfit.colorScore}/100</Text></View>
      <FormField label={`추천 ${index + 1} 코디 이름`} value={name} maxLength={160} editable={!disabled} onChangeText={setName} style={{ minHeight: 42, padding: 10, fontSize: 14 }} />
      <PreviewSurface ref={preview} name={name} items={outfit.items} photos={renderPhotos} mode={mode} preset={preset} />
      {photos.isError && <Text style={{ color: colors.danger, fontSize: 12 }}>사진을 불러오지 못했어요. 이미지 저장 전에 다시 시도해 주세요.</Text>}
      <View style={{ gap: 8 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>이 조합을 추천한 이유</Text>{outfit.reasons.map((reason) => <Text key={reason} style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>{reason}</Text>)}</View>
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 8, gap: 5 }}>{recommendationSlots.map((slot) => { const item = outfit.items[slot]; const locked = Boolean(item && options.locks[slot] === item.id); return <View key={slot} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.muted, fontSize: 10 }}>{slotLabels[slot]}</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 12 }}>{item?.name ?? '보유 의류 없음·제외'}</Text></View>{item && <OutfitControl label={`${slotLabels[slot]} ${locked ? '고정 해제' : '고정'}`} selected={locked} disabled={disabled} onPress={() => onLock(slot, item.id)} style={{ paddingHorizontal: 7 }} />}<OutfitControl label={`${slotLabels[slot]} 교체`} disabled={disabled || locked} onPress={() => onReplace(slot)} style={{ paddingHorizontal: 7 }} /></View>; })}</View>
      <ImageActions owner={owner} draft={draft} items={outfit.items} mode={mode} preset={preset} preview={preview} disabled={disabled || photos.isPending || photos.isError || !name.trim()} saveLabel={stored ? '코디·이미지 다시 저장' : '코디 저장'} acquire={acquire} onBusy={onBusy} />
      {stored && <OutfitControl label="저장된 코디 보기·수정" disabled={disabled} onPress={() => router.push({ pathname: '/outfits/[outfitId]', params: { outfitId: stored.id } })} />}
    </View>
  </View>;
}
