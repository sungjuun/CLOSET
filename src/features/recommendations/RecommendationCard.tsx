import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { FormField } from '@/components/ui/FormField';
import { useTheme } from '@/theme/useTheme';
import type { Tables } from '@/types/database.generated';
import { OutfitControl } from '../outfits/EditorControls';
import { slotLabels } from '../outfits/draft';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto } from '../wardrobe/photos/model';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { recommendationSlots, type RecommendationOptions, type RecommendedOutfit, type RecommendationSlot } from './engine';
import { PreviewSurface, type PreviewHandle } from './PreviewSurface';
import { ImageActions } from './ImageActions';
import { useRecommendationActions } from './hooks';
import { recommendedDraft } from './service';
import { recommendationPresentation } from './presentation';

export function RecommendationCard({ owner, outfit, index, options, disabled, onBusy, onLock, onReplace }: { owner: string; outfit: RecommendedOutfit; index: number; options: RecommendationOptions; disabled: boolean; onBusy: (value: boolean) => void; onLock: (slot: RecommendationSlot, id: string) => void; onReplace: (slot: RecommendationSlot) => void }) {
  const colors = useTheme(); const router = useRouter(); const actions = useRecommendationActions(owner);
  const presentation = recommendationPresentation(outfit, options);
  const [name, setName] = useState(`${presentation.title} ${String(index + 1).padStart(2, '0')}`); const [stored, setStored] = useState<Tables<'outfits'> | null>(null);
  const [details, setDetails] = useState(false); const [replacing, setReplacing] = useState(false);
  const [storedSnapshot, setStoredSnapshot] = useState(''); const requestId = useRef(randomUUID()); const preview = useRef<PreviewHandle | null>(null);
  const draft = recommendedDraft(outfit, name, options); const snapshot = JSON.stringify(draft);
  const ids = Object.values(outfit.items).map((item) => item!.id); const photos = usePhotos(ids);
  const renderPhotos = ids.flatMap((id) => { const photo = primaryPhoto(photos.data ?? [], id); return photo?.signedUrl ? [{ itemId: id, uri: photo.signedUrl }] : []; });
  async function acquire(signal: AbortSignal) {
    if (stored && storedSnapshot === snapshot) return stored;
    const result = await actions.service.save(stored?.id ?? requestId.current, stored?.updated_at ?? null, draft, signal);
    if (actions.active()) { setStored(result); setStoredSnapshot(snapshot); }
    return result;
  }
  return <View testID="recommendation-card" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.background, overflow: 'hidden' }}><View style={{ padding: 12, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.text, fontSize: 12 }}>추천 코디 {index + 1}</Text><View style={{ paddingHorizontal: 9, paddingVertical: 4, backgroundColor: colors.surface, borderRadius: 12 }}><Text accessibilityLabel={`종합 추천 점수 ${outfit.score}점`} style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>{outfit.score}점</Text></View></View>
    <PreviewSurface ref={preview} name={name} items={outfit.items} photos={renderPhotos} caption={false} />
    <View style={{ gap: 6 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '800', lineHeight: 24 }} numberOfLines={2}>{name}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }} numberOfLines={3}>{presentation.description}</Text></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{presentation.tags.map((tag) => <View key={tag} style={{ paddingHorizontal: 7, paddingVertical: 5, backgroundColor: colors.surface, borderRadius: 5 }}><Text style={{ color: colors.primary, fontSize: 11 }}>#{tag}</Text></View>)}</View>
    <View style={{ gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}><Text style={{ color: colors.muted, fontSize: 11 }}>사용된 아이템 {ids.length}개</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{recommendationSlots.flatMap((slot) => {
      const item = outfit.items[slot]; if (!item) return []; const locked = options.locks[slot] === item.id;
      return [<Pressable key={slot} accessibilityRole="button" accessibilityLabel={`${slotLabels[slot]} ${item.name} 교체${locked ? ', 고정 중' : ''}`} accessibilityState={{ disabled: disabled || locked }} disabled={disabled || locked} onPress={() => onReplace(slot)} style={{ width: 45, minHeight: 45, borderWidth: 1, borderColor: locked ? colors.primary : colors.border, borderRadius: 7, overflow: 'hidden' }}><PhotoFrame photo={primaryPhoto(photos.data ?? [], item.id)} loading={photos.isPending} error={photos.isError} borderRadius={6} />{locked && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.primary, paddingVertical: 1 }}><Text style={{ color: colors.onPrimary, fontSize: 8, textAlign: 'center' }}>고정</Text></View>}</Pressable>];
    })}</ScrollView></View>
    {photos.isError && <Text style={{ color: colors.danger, fontSize: 12 }}>사진을 불러오지 못했어요. 다시 확인해 주세요.</Text>}
    <ImageActions compact owner={owner} draft={draft} items={outfit.items} preview={preview} disabled={disabled || photos.isPending || photos.isError || !name.trim()} saveLabel={stored && storedSnapshot === snapshot ? '저장됨' : '저장'} acquire={acquire} onBusy={onBusy} showDownload={details}>
      <OutfitControl label="아이템 교체" icon="refresh" disabled={disabled} selected={replacing} onPress={() => setReplacing((value) => !value)} style={{ flex: 1.45, minWidth: 0, paddingHorizontal: 5, minHeight: 40 }} />
      <OutfitControl label={`추천 코디 ${index + 1} 더보기`} icon="more" iconOnly expanded={details} disabled={disabled} onPress={() => setDetails((value) => !value)} style={{ minWidth: 36, paddingHorizontal: 6, minHeight: 40 }} />
    </ImageActions>
    {stored && <OutfitControl variant="quiet" label="저장된 코디 보기·수정" disabled={disabled} onPress={() => router.push({ pathname: '/outfits/[outfitId]', params: { outfitId: stored.id } })} style={{ minHeight: 36, justifyContent: 'flex-start', paddingHorizontal: 0 }} />}
    {(replacing || details) && <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>아이템 교체·고정</Text>{recommendationSlots.map((slot) => { const item = outfit.items[slot]; const locked = Boolean(item && options.locks[slot] === item.id); return <View key={slot} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.muted, fontSize: 10 }}>{slotLabels[slot]}</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 11 }}>{item?.name ?? '미선택'}</Text></View>{item && <OutfitControl label={`${slotLabels[slot]} ${locked ? '고정 해제' : '고정'}`} selected={locked} disabled={disabled} onPress={() => onLock(slot, item.id)} style={{ paddingHorizontal: 5 }} />}<OutfitControl label={`${slotLabels[slot]} 교체`} disabled={disabled || locked} onPress={() => onReplace(slot)} style={{ paddingHorizontal: 5 }} /></View>; })}</View>}
    {details && <View style={{ gap: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}><FormField label={`추천 ${index + 1} 코디 이름`} value={name} maxLength={160} editable={!disabled} onChangeText={setName} style={{ minHeight: 42, padding: 10, fontSize: 14 }} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>색상 조화 {outfit.colorScore}/100</Text>{outfit.reasons.map((reason) => <Text key={reason} style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>{reason}</Text>)}</View>}
  </View></View>;
}
