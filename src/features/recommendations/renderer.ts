import { flatlaySize } from './flatlay';
import type { RefObject } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { type CaptureView, type RenderedOutfit, type RenderRequest } from './renderModel';

// The SDK module publishes TSX that fails exactOptionalPropertyTypes internally.
// A narrow runtime bridge keeps the app's strict compiler settings intact.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- avoid the vendor's incompatible source types
const { captureRef } = require('react-native-view-shot') as { captureRef: (target: RefObject<CaptureView | null>, options: { format: 'png'; result: 'base64'; width: number; height: number }) => Promise<string> };

export async function renderOutfit(request: RenderRequest): Promise<RenderedOutfit> {
  async function capture(input: RenderRequest): Promise<RenderedOutfit> {
    if (!input.targets) throw new Error('render_target_unavailable');
    await input.targets.waitForImages();
    if (input.signal.aborted) throw new Error('render_cancelled');
    const ref = input.targets.items;
    if (!ref.current) throw new Error('render_target_unavailable');
    const base64 = await captureRef(ref, { format: 'png', result: 'base64', width: flatlaySize.width, height: flatlaySize.height });
    if (input.signal.aborted) throw new Error('render_cancelled');
    return { bytes: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)).buffer, width: flatlaySize.width, height: flatlaySize.height, kind: 'item-board' };
  }
  return capture(request);
}
export async function downloadOutfitImage(image: RenderedOutfit) {
  if (!await Sharing.isAvailableAsync()) throw new Error('sharing_unavailable');
  const file = new File(Paths.cache, `closet-outfit-${Date.now()}.png`);
  try { file.write(new Uint8Array(image.bytes)); await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '코디 이미지 저장·공유' }); }
  finally { if (file.exists) file.delete(); }
}
