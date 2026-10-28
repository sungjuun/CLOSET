import { wearDateSchema, wearEditSchema, WearError, type WearEditInput } from './model';

export function localCalendarDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function monthRange(date: string) {
  wearDateSchema.parse(date);
  const year = Number(date.slice(0, 4)); const month = Number(date.slice(5, 7));
  return { start: `${date.slice(0, 7)}-01`, end: `${date.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` };
}
export function moveMonth(date: string, delta: number): string | null {
  wearDateSchema.parse(date);
  if (!Number.isSafeInteger(delta)) throw new Error('Invalid month offset');
  const ordinal = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + delta;
  if (ordinal < 1900 * 12 || ordinal >= 10000 * 12) return null;
  const year = Math.floor(ordinal / 12); const month = ordinal % 12 + 1;
  const day = Math.min(Number(date.slice(8)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function calendarDays(date: string): (string | null)[] {
  const range = monthRange(date);
  const offset = new Date(`${range.start}T00:00:00Z`).getUTCDay();
  const length = Number(range.end.slice(8));
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > length ? null : `${range.start.slice(0, 8)}${String(day).padStart(2, '0')}`;
  });
}
export type ChosenWearOutfit = { id: string; version: string; name: string; itemIds: string[] };
export type WearFormDraft = { wornOn: string; memo: string; mode: 'keep' | 'outfit' | 'items'; outfit: ChosenWearOutfit | null; itemIds: string[] };
export function emptyWearDraft(date: string): WearFormDraft { return { wornOn: date, memo: '', mode: 'outfit', outfit: null, itemIds: [] }; }
export function wearDraftFingerprint(draft: WearFormDraft) {
  return JSON.stringify({ wornOn: draft.wornOn, memo: draft.memo, mode: draft.mode,
    ...(draft.mode === 'outfit' ? { outfitId: draft.outfit?.id ?? null, version: draft.outfit?.version ?? null } : draft.mode === 'items' ? { ids: [...draft.itemIds].sort() } : {}) });
}
export function wearFormInput(draft: WearFormDraft): WearEditInput {
  const base = { wornOn: draft.wornOn, memo: draft.memo };
  if (draft.mode === 'keep') return wearEditSchema.parse({ ...base, kind: 'keep' });
  if (draft.mode === 'outfit') {
    if (!draft.outfit) throw new WearError('selection_required');
    return wearEditSchema.parse({ ...base, kind: 'outfit', outfitId: draft.outfit.id, outfitVersion: draft.outfit.version });
  }
  return wearEditSchema.parse({ ...base, kind: 'items', itemIds: draft.itemIds });
}
