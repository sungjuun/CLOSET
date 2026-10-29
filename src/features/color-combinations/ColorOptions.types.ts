import type { BaseColorId } from './palettes';

export type ColorOptionsProps = { selected: BaseColorId; onSelect: (id: BaseColorId) => void; columns: number; width: number };
