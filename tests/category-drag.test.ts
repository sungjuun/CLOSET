import { describe, expect, it } from 'vitest';
import { categoryDragDestination, categoryDragLayouts, categoryDragShift, categoryDragTarget, droppedCategoryOrder } from '../src/features/categories/drag';

describe('category drag ordering', () => {
  const rows = [{ y: 0, height: 64 }, { y: 64, height: 128 }, { y: 192, height: 64 }];
  it('inserts at any position without mutating or losing sibling IDs', () => {
    const original = ['a', 'b', 'c', 'd', 'e'];
    expect(droppedCategoryOrder(original, 'a', 4)).toEqual(['b', 'c', 'd', 'e', 'a']);
    expect(droppedCategoryOrder(original, 'e', 1)).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(original).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('does not save unchanged, invalid or duplicate orders', () => {
    expect(droppedCategoryOrder(['a', 'b'], 'a', 0)).toBeNull();
    expect(droppedCategoryOrder(['a', 'b'], 'missing', 1)).toBeNull();
    for (const index of [-1, 2, 0.5, NaN]) expect(droppedCategoryOrder(['a', 'b'], 'a', index)).toBeNull();
    expect(droppedCategoryOrder(['a', 'a'], 'a', 1)).toBeNull();
  });
  it('uses measured row heights and clamps drops beyond the list', () => {
    expect(categoryDragTarget(rows, 0, 40)).toBe(1);
    expect(categoryDragTarget(rows, 0, 170)).toBe(2);
    expect(categoryDragTarget(rows, 2, -200)).toBe(0);
    expect(categoryDragTarget(rows, 0, -999)).toBe(0);
    expect(categoryDragTarget(rows, 0, 999)).toBe(2);
    expect(categoryDragTarget(rows, 1, NaN)).toBe(1);
  });
  it('can place a tall row after a shorter final row and computes the correct landing position', () => {
    const unequal = [{ y: 0, height: 200 }, { y: 200, height: 10 }];
    expect(categoryDragTarget(unequal, 0, 105)).toBe(1);
    expect(categoryDragDestination(unequal, 0, 1)).toBe(10);
    expect(categoryDragDestination(rows, 0, 1)).toBe(128);
    expect(categoryDragDestination(rows, 2, 0)).toBe(-192);
  });
  it('opens exactly one row-sized gap as adjacent rows move around the dragged item', () => {
    expect([0, 1, 2, 3].map((index) => categoryDragShift(index, 0, 2, 80))).toEqual([0, -80, -80, 0]);
    expect([0, 1, 2, 3].map((index) => categoryDragShift(index, 3, 1, 80))).toEqual([0, 80, 80, 0]);
  });
  it('recomputes row positions after consecutive reorders even when element sizes have not changed', () => {
    expect(categoryDragLayouts([64, 128, 64])).toEqual(rows);
    expect(categoryDragLayouts([128, 64, 64])).toEqual([{ y: 0, height: 128 }, { y: 128, height: 64 }, { y: 192, height: 64 }]);
    expect(categoryDragLayouts([64, 0])).toBeNull();
    expect(categoryDragLayouts([64, Infinity])).toBeNull();
  });
});
