import { z } from 'zod';
import type { RefObject, ComponentRef } from 'react';
import type { View } from 'react-native';
import type { RecommendationItem, RecommendationSlot } from './engine';

export const viewModes = ['items', 'mannequin'] as const;
export const bodyPresets = ['slim', 'regular', 'broad'] as const;
export const modeSchema = z.enum(viewModes); export type ViewMode = z.infer<typeof modeSchema>;
export const presetSchema = z.enum(bodyPresets); export type BodyPreset = z.infer<typeof presetSchema>;
export const presetLabels = { slim: '슬림형', regular: '보통형', broad: '체격형' } as const;
export const renderKindSchema = z.enum(['item-board', 'mannequin-sample']);
export type RenderKind = z.infer<typeof renderKindSchema>;
export type RenderPhoto = { itemId: string; uri: string };
export type CaptureView = ComponentRef<typeof View>;
export type RenderRequest = { name: string; mode: ViewMode; preset: BodyPreset; items: Partial<Record<RecommendationSlot, RecommendationItem>>; photos: RenderPhoto[]; signal: AbortSignal; targets?: { items: RefObject<CaptureView | null>; mannequin: RefObject<CaptureView | null>; waitForImages: () => Promise<void> } };
export type RenderedOutfit = { bytes: ArrayBuffer; width: number; height: number; kind: RenderKind; notice?: string };
export interface OutfitRenderAdapter { itemBoard(request: RenderRequest): Promise<RenderedOutfit>; mannequin(request: RenderRequest): Promise<RenderedOutfit> }

// A future server-side VTO provider can implement the same adapter. No external
// provider or credentials are registered in this version.
export async function renderWithFallback(request: RenderRequest, adapter: OutfitRenderAdapter): Promise<RenderedOutfit> {
  if (request.signal.aborted) throw new Error('render_cancelled');
  if (request.mode === 'items') return adapter.itemBoard(request);
  try { return await adapter.mannequin(request); }
  catch (error) {
    if (request.signal.aborted) throw error;
    const result = await adapter.itemBoard(request);
    return { ...result, notice: '마네킹 표현을 만들지 못해 실제 의류 사진 나열형으로 표시합니다.' };
  }
}
