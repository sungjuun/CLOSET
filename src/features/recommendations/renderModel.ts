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
export type RenderRequest = { name: string; items: Partial<Record<RecommendationSlot, RecommendationItem>>; photos: RenderPhoto[]; signal: AbortSignal; targets?: { items: RefObject<CaptureView | null>; waitForImages: () => Promise<void> } };
export type RenderedOutfit = { bytes: ArrayBuffer; width: number; height: number; kind: RenderKind; notice?: string };
