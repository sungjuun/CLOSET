import { describe, expect, it } from 'vitest';
import { calendarDays, emptyWearDraft, localCalendarDate, monthRange, moveMonth, wearDraftFingerprint, wearFormInput } from '../src/features/wear/calendar';
import { wearEditArgs, wearKeys } from '../src/features/wear/model';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const version = '2026-10-28T12:34:56.123456+00:00';
describe('wear calendar and form state', () => {
  it('builds six complete weeks with exactly the real dates of a leap February', () => {
    const days = calendarDays('2024-02-20');
    expect(days).toHaveLength(42);
    expect(days.filter(Boolean)).toHaveLength(29);
    expect(days[4]).toBe('2024-02-01');
    expect(new Set(days.filter(Boolean)).size).toBe(29);
    expect(monthRange('2024-02-20')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthRange('2026-02-20').end).toBe('2026-02-28');
  });
  it('clamps the chosen day when switching months and prevents unsupported year boundaries', () => {
    expect(moveMonth('2024-01-31', 1)).toBe('2024-02-29');
    expect(moveMonth('2026-03-31', -1)).toBe('2026-02-28');
    expect(moveMonth('2026-12-28', 1)).toBe('2027-01-28');
    expect(moveMonth('1900-01-01', -1)).toBeNull();
    expect(moveMonth('9999-12-31', 1)).toBeNull();
    expect(calendarDays('9999-12-31').filter(Boolean)).toHaveLength(31);
    expect(() => moveMonth('2026-01-01', 0.5)).toThrow();
  });
  it('uses local calendar parts for today and preserves the selected date in a new form', () => {
    expect(localCalendarDate(new Date(2026, 9, 28, 0, 1))).toBe('2026-10-28');
    expect(emptyWearDraft('2024-02-29')).toMatchObject({ wornOn: '2024-02-29', mode: 'outfit', memo: '', outfit: null, itemIds: [] });
  });
  it('keeps existing snapshots out of metadata-only edits and strips extra input fields', () => {
    const draft = { ...emptyWearDraft('2026-10-28'), mode: 'keep' as const, memo: ' 메모 ', itemIds: [id], outfit: { id, version, name: '바뀐 코디', itemIds: [other] } };
    expect(wearFormInput(draft)).toEqual({ kind: 'keep', wornOn: '2026-10-28', memo: '메모' });
    expect(wearEditArgs(id, version, wearFormInput(draft))).toEqual({ p_id: id, p_expected: version, p_mode: 'keep', p_worn_on: '2026-10-28', p_memo: '메모' });
  });
  it('tracks only the active selection mode and ignores picker labels and unused cached choices', () => {
    const keep = { ...emptyWearDraft('2026-10-28'), mode: 'keep' as const };
    expect(wearDraftFingerprint({ ...keep, itemIds: [id] })).toBe(wearDraftFingerprint(keep));
    const outfit = { ...keep, mode: 'outfit' as const, outfit: { id, version, name: '원본', itemIds: [id] } };
    expect(wearDraftFingerprint({ ...outfit, outfit: { ...outfit.outfit, name: '표시 이름', itemIds: [other] } })).toBe(wearDraftFingerprint(outfit));
    expect(wearDraftFingerprint({ ...outfit, outfit: { ...outfit.outfit, version: '2026-10-28T13:00:00+00:00' } })).not.toBe(wearDraftFingerprint(outfit));
    expect(wearDraftFingerprint({ ...keep, mode: 'items', itemIds: [id, other] })).toBe(wearDraftFingerprint({ ...keep, mode: 'items', itemIds: [other, id] }));
  });
  it('requires an explicit source and preserves the precise version of an outfit replacement', () => {
    expect(() => wearFormInput(emptyWearDraft('2026-10-28'))).toThrow('selection_required');
    const input = wearFormInput({ ...emptyWearDraft('2026-10-28'), outfit: { id: other, version, name: '코디', itemIds: [id] } });
    expect(wearEditArgs(id, version, input)).toMatchObject({ p_mode: 'outfit', p_outfit: other, p_outfit_expected: version, p_expected: version });
    expect(wearEditArgs(id, version, { kind: 'items', wornOn: '2026-10-28', memo: '', itemIds: [other] })).toMatchObject({ p_mode: 'items', p_items: [other] });
    expect(() => wearEditArgs(id, '', input)).toThrow();
  });
  it('separates calendar counts from paginated lists while including both date bounds and the owner', () => {
    const range = { start: '2026-10-01', end: '2026-10-31' };
    expect(wearKeys.counts('a', range)).not.toEqual(wearKeys.list('a', 0, range));
    expect(wearKeys.counts('a', range)).not.toEqual(wearKeys.counts('b', range));
    expect(wearKeys.counts('a', range)).not.toEqual(wearKeys.counts('a', { ...range, end: '2026-10-30' }));
    expect(wearKeys.counts('a', range).slice(0, 3)).toEqual(wearKeys.root('a'));
  });
});
