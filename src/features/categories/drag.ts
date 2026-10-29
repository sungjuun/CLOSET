export type CategoryRowLayout = { y: number; height: number };

export function categoryDragLayouts(heights: readonly number[]) {
  if (heights.some((height) => !Number.isFinite(height) || height <= 0)) return null;
  let y = 0;
  return heights.map((height) => { const row = { y, height }; y += height; return row; });
}

export function categoryDragTarget(layouts: readonly CategoryRowLayout[], from: number, dy: number) {
  const source = layouts[from];
  if (!source || !Number.isFinite(dy)) return from;
  const center = source.y + source.height / 2 + dy;
  const found = layouts.findIndex((row) => center < row.y + row.height);
  return found < 0 ? layouts.length - 1 : found;
}

export function droppedCategoryOrder(ids: readonly string[], slug: string, to: number) {
  const from = ids.indexOf(slug);
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= ids.length || from === to || new Set(ids).size !== ids.length) return null;
  const result = [...ids]; result.splice(from, 1); result.splice(to, 0, slug);
  return result;
}

export function categoryDragShift(index: number, from: number, to: number, height: number) {
  if (from < to && index > from && index <= to) return -height;
  if (from > to && index >= to && index < from) return height;
  return 0;
}

export function categoryDragDestination(layouts: readonly CategoryRowLayout[], from: number, to: number) {
  const source = layouts[from]; const target = layouts[to];
  if (!source || !target) return 0;
  return to > from ? target.y + target.height - source.y - source.height : target.y - source.y;
}
