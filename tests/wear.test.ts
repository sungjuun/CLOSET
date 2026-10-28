import { describe, expect, it } from 'vitest';
import { wearDateSchema, wearErrorMessage, wearKeys, wearRangeSchema, wearRecordArgs, wearRecordSchema } from '../src/features/wear/model';

const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const version = '2026-10-28T12:34:56.123456+00:00';

describe('wear recording contracts', () => {
  it('validates real leap-year calendar dates without timezone conversion', () => {
    for (const date of ['1900-01-01', '2000-02-29', '2024-02-29', '2026-10-28', '9999-12-31']) expect(wearDateSchema.parse(date)).toBe(date);
    for (const date of ['1899-12-31', '1900-02-29', '2026-02-29', '2026-04-31', '2026-13-01', '2026-10-28T00:00:00Z', 'infinity']) expect(wearDateSchema.safeParse(date).success).toBe(false);
  });
  it('accepts at most 366 inclusive dates and rejects reversed or invalid ranges', () => {
    expect(wearRangeSchema.parse({ start: '2024-01-01', end: '2024-12-31' })).toEqual({ start: '2024-01-01', end: '2024-12-31' });
    for (const range of [{ start: '2024-01-01', end: '2025-01-01' }, { start: '2026-10-29', end: '2026-10-28' }, { start: '2026-02-30', end: '2026-03-01' }]) expect(wearRangeSchema.safeParse(range).success).toBe(false);
  });
  it('normalizes manual IDs, strips injected ownership, and never mutates the input', () => {
    const ids = [second.toUpperCase(), first];
    const input = { kind: 'items' as const, wornOn: '2026-10-28', memo: '  기록  ', itemIds: ids, user_id: 'foreign', outfitId: second };
    expect(wearRecordArgs(first, input)).toEqual({ p_id: first, p_worn_on: '2026-10-28', p_memo: '기록', p_items: [first, second] });
    expect(ids).toEqual([second.toUpperCase(), first]);
  });
  it('rejects missing, duplicate, excessive, and invalid garment requests', () => {
    for (const itemIds of [[], [first, first.toUpperCase()], ['invalid'], Array.from({ length: 51 }, () => first)]) {
      expect(wearRecordSchema.safeParse({ kind: 'items', wornOn: '2026-10-28', memo: '', itemIds }).success).toBe(false);
    }
    expect(wearRecordSchema.safeParse({ kind: 'items', wornOn: '2026-10-28', memo: 'a'.repeat(5001), itemIds: [first] }).success).toBe(false);
  });
  it('preserves the exact outfit version and rejects missing or malformed versions', () => {
    expect(wearRecordArgs(first, { kind: 'outfit', wornOn: '2026-10-28', memo: '', outfitId: second, outfitVersion: version })).toEqual({ p_id: first, p_worn_on: '2026-10-28', p_memo: '', p_outfit: second, p_outfit_expected: version });
    for (const outfitVersion of ['', 'invalid', '2026-10-28']) expect(wearRecordSchema.safeParse({ kind: 'outfit', wornOn: '2026-10-28', memo: '', outfitId: second, outfitVersion }).success).toBe(false);
  });
  it('separates owner, range, page and detail cache keys and keeps errors free of server text', () => {
    const range = { start: '2026-10-01', end: '2026-10-31' };
    const base = wearKeys.list('a', 0, range);
    expect(wearKeys.list('b', 0, range)).not.toEqual(base);
    expect(wearKeys.list('a', 1, range)).not.toEqual(base);
    expect(wearKeys.list('a', 0, { ...range, start: '2026-10-02' })).not.toEqual(base);
    expect(wearKeys.item('a', first)).not.toEqual(wearKeys.item('a', second));
    expect(wearKeys.item('a', first).slice(0, 3)).toEqual(wearKeys.root('a'));
    expect(wearErrorMessage({ code: '40001' })).toContain('입력을 유지');
    expect(wearErrorMessage(new Error('secret database trace'))).not.toContain('secret');
  });
});
