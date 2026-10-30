import type { RefObject } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { renderWithFallback, type CaptureView, type RenderedOutfit, type RenderRequest } from './renderModel';

// The SDK module publishes TSX that fails exactOptionalPropertyTypes internally.
// A narrow runtime bridge keeps the app's strict compiler settings intact.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- avoid the vendor's incompatible source types
const { captureRef } = require('react-native-view-shot') as { captureRef: (target: RefObject<CaptureView | null>, options: { format: 'png'; result: 'base64'; width: number; height: number }) => Promise<string> };

export async function renderOutfit(request: RenderRequest): Promise<RenderedOutfit> {
  async function capture(input: RenderRequest, mode: 'items' | 'mannequin'): Promise<RenderedOutfit> {
    if (!input.targets) throw new Error('render_target_unavailable');
    await input.targets.waitForImages();
    if (input.signal.aborted) throw new Error('render_cancelled');
    const ref = mode === 'items' ? input.targets.items : input.targets.mannequin;
    if (!ref.current) throw new Error('render_target_unavailable');
    const base64 = await captureRef(ref, { format: 'png', result: 'base64', width: 900, height: 1100 });
    if (input.signal.aborted) throw new Error('render_cancelled');
    return { bytes: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)).buffer, width: 900, height: 1100, kind: mode === 'items' ? 'item-board' : 'mannequin-sample' };
  }
  return renderWithFallback(request, { itemBoard: (input) => capture(input, 'items'), mannequin: (input) => capture(input, 'mannequin') });
}
export async function downloadOutfitImage(image: RenderedOutfit) {
  if (!await Sharing.isAvailableAsync()) throw new Error('sharing_unavailable');
  const file = new File(Paths.cache, `closet-outfit-${Date.now()}.png`);
  try { file.write(new Uint8Array(image.bytes)); await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '코디 이미지 저장·공유' }); }
  finally { if (file.exists) file.delete(); }
}
