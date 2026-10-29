import type { ColorId, OutfitColor } from './finder';
export type ColorGridProps = { colors: readonly OutfitColor[]; selected: ColorId | null; onSelect: (id: ColorId) => void; width: number; columns: number; label: string };
