import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { privateQueryKey } from '@/lib/query/keys';
import type { Tables } from '@/types/database.generated';
import { useUserId } from '@/providers/AppProviders';
import { useSelectedOutfitItems } from '../outfits/queries';
import type { OutfitDraft } from '../outfits/draft';
import { useCategories } from '../wardrobe/queries';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto } from '../wardrobe/photos/model';
import { OutfitControl } from '../outfits/EditorControls';
import { itemAsCandidate, type createRecommendationService } from './service';
import { useRecommendationActions } from './hooks';
import { PreviewSurface, type PreviewHandle } from './PreviewSurface';
import { ImageActions } from './ImageActions';
import type { RecommendationItem, RecommendationSlot } from './engine';

type Props = { outfit: Tables<'outfits'>; draft: OutfitDraft; dirty: boolean; editorBusy: boolean; onBusy: (value: boolean) => void };
export function SavedPresentationPanel(props: Props) {
  const colors = useTheme();
  if (props.dirty) return <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>변경한 코디를 먼저 저장하면 플랫레이 이미지를 생성할 수 있어요.</Text>;
  if (props.draft.items.onepiece) return <Text style={{ color: colors.muted, fontSize: 12 }}>기존 원피스 코디는 유지됩니다. 새 이미지 표현은 상의·하의 등 6종류 구성을 지원합니다.</Text>;
  return <LoadPresentation key={`${props.outfit.id}:${props.outfit.updated_at}`} {...props} />;
}
function LoadPresentation(props: Props) {
  const owner = useUserId()!; const colors = useTheme(); const { service } = useRecommendationActions(owner);
  const query = useQuery({ queryKey: privateQueryKey(owner, 'recommendations', { kind: 'presentation', id: props.outfit.id, version: props.outfit.updated_at }), queryFn: ({ signal }) => service.presentation(props.outfit.id, props.outfit.updated_at, signal), gcTime: 0, refetchOnMount: 'always' });
  if (query.isPending) return <Text style={{ color: colors.muted }}>코디 표현 설정을 불러오는 중…</Text>;
  if (query.isError) return <View style={{ gap: 8 }}><Text style={{ color: colors.danger }}>표현 설정을 불러오지 못했어요.</Text><OutfitControl label="표현 설정 다시 확인" onPress={() => { void query.refetch(); }} /></View>;
  return <PresentationEditor {...props} owner={owner} initial={query.data} onStored={() => { void query.refetch(); }} />;
}
type Initial = Awaited<ReturnType<ReturnType<typeof createRecommendationService>['presentation']>>;
function PresentationEditor({ owner, initial, onStored, ...props }: Props & { owner: string; initial: Initial; onStored: () => void }) {
  const colors = useTheme();
  const [busy, setBusy] = useState(false); const preview = useRef<PreviewHandle | null>(null);
  const ids = Object.values(props.draft.items); const selected = useSelectedOutfitItems(ids); const categories = useCategories(); const photos = usePhotos(ids);
  const items: Partial<Record<RecommendationSlot, RecommendationItem>> = {}; let invalid = false;
  if (categories.data && selected.data) for (const [slot, id] of Object.entries(props.draft.items)) {
    const item = selected.data.find((entry) => entry.id === id);
    if (!item || item.lifecycle_status !== 'active' || item.deleted_at) { invalid = true; continue; }
    try { const candidate = itemAsCandidate(item, categories.data); if (candidate.slot !== slot) invalid = true; else items[candidate.slot] = candidate; } catch { invalid = true; }
  }
  const blocked = props.editorBusy || busy || invalid || selected.isPending || selected.isError || categories.isPending || categories.isError || photos.isPending || photos.isError;
  const renderPhotos = ids.flatMap((id) => { const photo = primaryPhoto(photos.data ?? [], id); return photo?.signedUrl ? [{ itemId: id, uri: photo.signedUrl }] : []; });
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 18, gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>코디 이미지 표현</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>저장한 코디의 실제 의류 구성을 사용합니다. 옷과 소품을 펼쳐 놓은 플랫레이 이미지로 저장합니다.</Text>
    <View style={{ maxWidth: 380, width: '100%', alignSelf: 'center' }}><PreviewSurface ref={preview} name={props.draft.name} items={items} photos={renderPhotos} /></View>
    {invalid && <Text style={{ color: colors.danger, fontSize: 12 }}>사용할 수 없거나 분류가 바뀐 옷이 있어요. 코디에서 교체한 뒤 저장해 주세요.</Text>}
    {(selected.isError || photos.isError || categories.isError) && <OutfitControl label="이미지에 사용할 옷 다시 확인" onPress={() => { void Promise.all([selected.refetch(), photos.refetch(), categories.refetch()]); }} />}
    {initial?.asset && <Text style={{ color: colors.muted, fontSize: 12 }}>이 코디 버전의 비공개 이미지가 저장되어 있어요. 다시 저장하면 새 플랫레이 배치를 적용합니다.</Text>}
    <ImageActions owner={owner} draft={props.draft} items={items} preview={preview} disabled={blocked} saveLabel="표현 이미지 저장" acquire={async () => props.outfit} onBusy={(value) => { setBusy(value); props.onBusy(value); }} onStored={onStored} />
  </View>;
}
