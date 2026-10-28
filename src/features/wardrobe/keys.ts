import { privateQueryKey, privateQueryPrefix } from '../../lib/query/keys';
import { listFiltersSchema, type WardrobeFilters } from './filters';

export const wardrobeKeys = {
  root: (userId: string) => privateQueryPrefix(userId, 'wardrobe'),
  list: (userId: string, page: number, filters: WardrobeFilters) => privateQueryKey(userId, 'wardrobe', { kind: 'list', page, ...listFiltersSchema.parse(filters) }),
  options: (userId: string) => privateQueryKey(userId, 'wardrobe', { kind: 'filter-options' }),
  usage: (userId: string, id: string) => privateQueryKey(userId, 'wardrobe', { kind: 'usage', id }),
  trash: (userId: string, page: number) => privateQueryKey(userId, 'wardrobe', { kind: 'trash', page }),
  item: (userId: string, id: string) => privateQueryKey(userId, 'wardrobe', { kind: 'item', id }),
};
