import { z } from 'zod';
import type { RefObject, ComponentRef } from 'react';
import type { View } from 'react-native';
import type { RecommendationItem, RecommendationSlot } from './engine';

export const viewModes = ['items', 'mannequin'] as const;
export const bodyPresets = ['slim', 'regular', 'broad'] as const;
export const modeSchema = z.enum(viewModes); export type ViewMode = z.infer<typeof modeSchema>;
export const presetSchema = z.enum(bodyPresets); export type BodyPreset = z.infer<typeof presetSchema>;
// Legacy values remain readable for existing records; the app renders items only.
export const renderKindSchema = z.enum(['item-board', 'mannequin-sample']);
export type RenderKind = z.infer<typeof renderKindSchema>;
export type RenderPhoto = { itemId: string; uri: string };
export type CaptureView = ComponentRef<typeof View>;
export type RenderLayer = { slot: RecommendationSlot; position: number; item: RecommendationItem };
export const renderEntries = (request: Pick<RenderRequest, 'items' | 'layers'>): RenderLayer[] => [...Object.entries(request.items).map(([slot, item]) => ({ slot: slot as RecommendationSlot, position: 0, item: item! })), ...(request.layers ?? [])];
export function renderItem(request: Pick<RenderRequest, 'items' | 'layers'>, slot: RecommendationSlot, position = 0) { return position === 0 ? request.items[slot]! : request.layers!.find(entry => entry.slot === slot && entry.position === position)!.item; }
export type RenderRequest = { layers?: RenderLayer[]; name: string; items: Partial<Record<RecommendationSlot, RecommendationItem>>; photos: RenderPhoto[]; signal: AbortSignal; targets?: { items: RefObject<CaptureView | null>; waitForImages: () => Promise<void> } };
export type RenderedOutfit = { bytes: ArrayBuffer; width: number; height: number; kind: RenderKind; notice?: string };
