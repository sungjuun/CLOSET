import { expect, it } from 'vitest';
import { wardrobeColumns } from '../src/theme/tokens';

it('matches the reference five-column desktop and two-column mobile grids', () => {
  expect([320, 390, 767, 768, 1023, 1024, 1199, 1200, 1280, 1440].map(wardrobeColumns))
    .toEqual([2, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
});
