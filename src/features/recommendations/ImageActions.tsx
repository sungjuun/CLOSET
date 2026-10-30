import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTheme } from '@/theme/useTheme';
import { OutfitControl } from '../outfits/EditorControls';
import { outfitErrorMessage } from '../outfits/repository';
import type { OutfitDraft } from '../outfits/draft';
import type { Tables } from '@/types/database.generated';
import { useRecommendationActions } from './hooks';
import { renderOutfit, downloadOutfitImage } from './renderer';
import type { PreviewHandle } from './PreviewSurface';
import type { RecommendationItem, RecommendationSlot } from './engine';
import type { BodyPreset, ViewMode, RenderedOutfit } from './renderModel';

type Props = { owner: string; draft: OutfitDraft; items: Partial<Record<RecommendationSlot, RecommendationItem>>; mode: ViewMode; preset: BodyPreset; preview: React.RefObject<PreviewHandle | null>; disabled: boolean; saveLabel: string; acquire: (signal: AbortSignal) => Promise<Tables<'outfits'>>; onBusy: (value: boolean) => void; onStored?: () => void };
export function ImageActions(props: Props) {
  const colors = useTheme(); const actions = useRecommendationActions(props.owner);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const lock = useRef(false);
  const prepared = useRef<{ key: string; id: string; image: RenderedOutfit } | null>(null);
  async function perform(save: boolean) {
    if (lock.current || props.disabled) return;
    lock.current = true; setBusy(true); props.onBusy(true); setMessage(''); let outfitStored = false;
    try {
      const result = await actions.run(async (api, signal) => {
        await api.validate(props.draft, signal);
        const stored = save ? await props.acquire(signal) : null;
        outfitStored = Boolean(stored);
        if (stored) await api.setPresentation(stored.id, stored.updated_at, props.mode, props.preset, signal);
        const key = JSON.stringify([stored?.id, stored?.updated_at, props.mode, props.preset, props.draft]);
        if (!prepared.current || prepared.current.key !== key) {
          const photos = await api.photos(Object.values(props.draft.items), signal);
          const image = await renderOutfit({ name: props.draft.name, mode: props.mode, preset: props.preset, items: props.items, photos, signal, ...(props.preview.current ? { targets: props.preview.current } : {}) });
          prepared.current = { key, id: randomUUID(), image };
        }
        const ready = prepared.current;
        if (stored) { await api.storeImage(ready.id, stored.id, stored.updated_at, props.mode, props.preset, ready.image, signal); await actions.refresh(); }
        else await downloadOutfitImage(ready.image);
        return `${save ? '코디와 표현 이미지를 저장했어요.' : '이미지를 저장·공유할 수 있어요.'}${ready.image.notice ? ` ${ready.image.notice}` : ''}${ready.image.kind === 'mannequin-sample' ? ' 마네킹 이미지는 샘플로 저장됩니다.' : ''}`;
      });
      if (result) { setMessage(result.value); if (save) props.onStored?.(); }
    } catch (error) { if (actions.active()) setMessage(`${outfitStored ? '코디는 저장됐지만 이미지 저장을 완료하지 못했어요. 같은 버튼으로 재시도할 수 있어요. ' : ''}${outfitErrorMessage(error)}`); }
    finally { lock.current = false; if (actions.active()) { setBusy(false); props.onBusy(false); } }
  }
  return <View style={{ gap: 10 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><OutfitControl label={props.saveLabel} variant="primary" disabled={props.disabled} loading={busy} onPress={() => { void perform(true); }} /><OutfitControl label="이미지 저장" disabled={props.disabled || busy} onPress={() => { void perform(false); }} /></View>{message !== '' && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 12, lineHeight: 21 }}>{message}</Text>}</View>;
}
