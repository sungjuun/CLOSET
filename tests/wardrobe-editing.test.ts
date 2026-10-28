import { describe, expect, it } from 'vitest';
import { editableFields, itemToDraft } from '../src/features/wardrobe/editing';
import { wardrobeDraftSchema } from '../src/features/wardrobe/schemas';
import { emptyWardrobeDraft, type WardrobeItem } from '../src/features/wardrobe/types';

describe('existing wardrobe form data', () => {
  const item = {
    name: '셔츠', category_slug: 'shirt', brand_name: null, color_name: null, color_hex: null,
    size_label: null, material: null, seasons: ['spring', 'autumn'], tags: ['출근', '휴일'],
    purchase_price: 0, currency: 'KRW', purchased_on: '2024-02-29', purchase_url: null, notes: '메모',
  } as WardrobeItem;
  it('round-trips zero, dates, nulls, seasons and tags without mutating the record', () => {
    const draft = itemToDraft(item);
    expect(draft.purchase_price).toBe('0');
    expect(draft.purchased_on).toBe('2024-02-29');
    const result = wardrobeDraftSchema.parse(draft);
    expect(result).toMatchObject(item);
    draft.seasons.push('winter');
    expect(item.seasons).toEqual(['spring', 'autumn']);
    expect(itemToDraft({ ...item, purchase_price: null }).purchase_price).toBe('');
  });
  it('keeps identity, favorite, lifecycle, deletion and timestamps out of form writes', () => {
    const input = { ...wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '셔츠', category_slug: 'shirt' }), user_id: 'foreign', id: 'foreign', is_favorite: true, lifecycle_status: 'sold', deleted_at: 'now', updated_at: 'past' };
    const payload = editableFields(input);
    for (const key of ['user_id', 'id', 'is_favorite', 'lifecycle_status', 'deleted_at', 'updated_at']) expect(payload).not.toHaveProperty(key);
    expect(payload.purchase_price).toBeNull();
  });
});
