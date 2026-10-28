import type { TablesUpdate } from '../../types/database.generated';
import type { WardrobeInput } from './schemas';
import type { WardrobeDraft, WardrobeItem } from './types';

export function itemToDraft(item: WardrobeItem): WardrobeDraft {
  return {
    name: item.name, category_slug: item.category_slug, brand_name: item.brand_name ?? '',
    color_name: item.color_name ?? '', color_hex: item.color_hex ?? '', size_label: item.size_label ?? '',
    material: item.material ?? '', seasons: [...item.seasons], tags: item.tags.join(', '),
    purchase_price: item.purchase_price === null ? '' : String(item.purchase_price), currency: item.currency,
    purchased_on: item.purchased_on ?? '', purchase_url: item.purchase_url ?? '', notes: item.notes ?? '',
  };
}

// Shared, explicit whitelist: editing the form cannot change identity, favorite,
// lifecycle, deletion, or timestamps, even when extra fields are supplied.
export function editableFields(input: WardrobeInput): TablesUpdate<'wardrobe_items'> {
  return {
    name: input.name, category_slug: input.category_slug, brand_name: input.brand_name,
    color_name: input.color_name, color_hex: input.color_hex, size_label: input.size_label,
    material: input.material, seasons: input.seasons, tags: input.tags,
    purchase_price: input.purchase_price, currency: input.currency, purchased_on: input.purchased_on,
    purchase_url: input.purchase_url, notes: input.notes,
  };
}
