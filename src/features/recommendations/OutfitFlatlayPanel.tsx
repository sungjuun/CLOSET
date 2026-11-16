import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { privateQueryKey } from '@/lib/query/keys';
import type { Tables } from '@/types/database.generated';
import { useUserId } from '@/providers/AppProviders';
import { draftEntries, type OutfitDraft } from '../outfits/draft';
import { primaryPhoto, type PrivatePhoto } from '../wardrobe/photos/model';
import type { Category, WardrobeItem } from '../wardrobe/types';
import { OutfitControl } from '../outfits/EditorControls';
import { itemAsCandidate } from './service';
import { useRecommendationActions } from './hooks';
import { PreviewSurface, type PreviewHandle } from './PreviewSurface';
import { ImageActions } from './ImageActions';
import type { RenderLayer } from './renderModel';
import type { RecommendationItem, RecommendationSlot } from './engine';

type Props = {
  outfit: Tables<'outfits'> | null;
  draft: OutfitDraft;
  selected: readonly WardrobeItem[];
  categories: readonly Category[];
  photos: readonly PrivatePhoto[];
  loading: boolean;
  loadFailed: boolean;
  dirty: boolean;
  editorBusy: boolean;
  onBusy: (value: boolean) => void;
  retry: () => void;
};

export function OutfitFlatlayPanel({ outfit, draft, selected, categories, photos, loading, loadFailed, dirty, editorBusy, onBusy, retry }: Props) {
  const owner = useUserId()!;
  const colors = useTheme();
  const preview = useRef<PreviewHandle | null>(null);
  const { service } = useRecommendationActions(owner);
  const presentation = useQuery({
    queryKey: privateQueryKey(owner, 'recommendations', { kind: 'presentation', id: outfit?.id, version: outfit?.updated_at }),
    queryFn: ({ signal }) => outfit ? service.presentation(outfit.id, outfit.updated_at, signal) : null,
    enabled: Boolean(outfit && !dirty && !draft.items.onepiece),
    gcTime: 0,
  });
  const entries = draftEntries(draft);
  if (!entries.length) return null;
  if (draft.items.onepiece) return <Text style={{ color: colors.muted, fontSize: 12 }}>플랫레이는 상의·하의 등 6종류 구성을 지원합니다.</Text>;

  const items: Partial<Record<RecommendationSlot, RecommendationItem>> = {};
  const layers: RenderLayer[] = [];
  let invalid = false;
  for (const { slot, item_id: id, position } of entries) {
    const item = selected.find((entry) => entry.id === id);
    if (!item || item.lifecycle_status !== 'active' || item.deleted_at) { invalid = true; continue; }
    try {
      const candidate = itemAsCandidate(item, categories);
      if (candidate.slot !== slot) { invalid = true; continue; }
      if (position === 0) items[candidate.slot] = candidate;
      else layers.push({ slot: candidate.slot, position, item: candidate });
    } catch { invalid = true; }
  }
  const renderPhotos = [...Object.values(items), ...layers.map(({ item }) => item)].flatMap((item) => {
    const photo = primaryPhoto(photos, item.id);
    return photo?.signedUrl ? [{ itemId: item.id, uri: photo.signedUrl }] : [];
  });
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>플랫레이 미리보기</Text>
    <View style={{ maxWidth: 360, width: '100%', alignSelf: 'center' }}>
      <PreviewSurface ref={preview} name={draft.name || '새 코디'} items={items} layers={layers} photos={renderPhotos} loading={loading} />
    </View>
    {!loading && !loadFailed && invalid && <Text style={{ color: colors.danger, fontSize: 12 }}>사용할 수 없거나 분류가 바뀐 옷이 있어요. 코디에서 교체해 주세요.</Text>}
    {loadFailed && <OutfitControl label="이미지에 사용할 옷 다시 확인" onPress={retry} />}
    {presentation.data?.asset && !dirty && <Text style={{ color: colors.muted, fontSize: 12 }}>이 코디의 표현 이미지가 저장되어 있어요.</Text>}
    {outfit && !dirty
      ? <ImageActions owner={owner} draft={draft} items={items} layers={layers} preview={preview} disabled={editorBusy || invalid || loading || loadFailed} saveLabel="표현 이미지 저장" acquire={async () => outfit} onBusy={onBusy} onStored={() => { void presentation.refetch(); }} />
      : <Text style={{ color: colors.muted, fontSize: 12 }}>코디를 저장하면 표현 이미지도 저장할 수 있어요.</Text>}
  </View>;
}
