import { describe, expect, it } from 'vitest';
import { defaultInsightFilters, insightArgs, insightCostLabel, insightKeys, insightListSchema, insightRange, insightScopeSchema, insightSummarySchema } from '../src/features/insights/model';
import { formatWon } from '../src/lib/format/money';
import { insightErrorMessage } from '../src/features/insights/repository';

describe('insight calculation and display contracts', () => {
  it('uses inclusive calendar-day periods across month/year and leap-day boundaries', () => {
    expect(insightRange({ asOf: '2026-10-28', period: '30' })).toEqual({ start: '2026-09-29', end: '2026-10-28' });
    expect(insightRange({ asOf: '2026-10-28', period: '90' }).start).toBe('2026-07-31');
    expect(insightRange({ asOf: '2024-03-01', period: '30' }).start).toBe('2024-02-01');
    expect(insightRange({ asOf: '2026-01-01', period: '30' }).start).toBe('2025-12-03');
  });
  it('leaves all-time start unbounded by a UI window and clamps the supported minimum date', () => {
    expect(insightRange({ asOf: '2026-10-28', period: 'all' })).toEqual({ start: null, end: '2026-10-28' });
    expect(insightRange({ asOf: '1900-01-01', period: '90' })).toEqual({ start: '1900-01-01', end: '1900-01-01' });
    expect(insightArgs({ asOf: '2026-10-28', period: 'all' })).toEqual({ p_as_of: '2026-10-28' });
    expect(insightArgs({ asOf: '2026-10-28', period: '90' })).toEqual({ p_as_of: '2026-10-28', p_days: 90 });
  });
  it('rejects unsupported dates/periods/list modes and keeps search punctuation literal', () => {
    for (const input of [{ asOf: '2026-02-29', period: '30' }, { asOf: '1899-12-31', period: 'all' }, { asOf: '2026-10-28', period: '31' }]) expect(insightScopeSchema.safeParse(input).success).toBe(false);
    expect(insightListSchema.parse({ mode: 'all', search: '  %,_"\\  ' }).search).toBe('%,_"\\');
    expect(insightListSchema.safeParse({ mode: 'sql', search: '' }).success).toBe(false);
    expect(insightListSchema.safeParse({ mode: 'all', search: 'a'.repeat(201) }).success).toBe(false);
  });
  it('keeps zero purchase price, unknown price and zero lifetime wear distinct', () => {
    expect(insightCostLabel({ purchase_price: null, lifetime_wear_count: 2, cost_per_wear: null, currency: 'KRW' })).toBe('가격 미입력');
    expect(insightCostLabel({ purchase_price: 120, lifetime_wear_count: 0, cost_per_wear: null, currency: 'KRW' })).toBe('기록 없음');
    expect(insightCostLabel({ purchase_price: 0, lifetime_wear_count: 2, cost_per_wear: 0, currency: 'KRW' })).toBe('0원');
    expect(insightCostLabel({ purchase_price: 120, lifetime_wear_count: 6, cost_per_wear: 20, currency: 'KRW' })).toBe('20원');
  });
  it('formats won consistently without inventing a missing amount', () => {
    expect(formatWon(125000)).toBe('125,000원');
    expect(formatWon(1234.5)).toBe('1,234.5원');
    expect(formatWon(null)).toBe('—');
    expect(formatWon(undefined)).toBe('—');
    expect(formatWon(0)).toBe('0원');
  });
  it('accepts real zero-data summaries but rejects missing/null/fabricated fields', () => {
    const empty = { as_of: '2026-10-28', start_on: null, days: null, wardrobe: { total: 0, active: 0, archived: 0, sold: 0, donated: 0, priced: 0, unpriced: 0, recorded: 0, unrecorded: 0, never_recorded: 0 }, wear: { events: 0, days: 0, garment_uses: 0 }, costs: [], categories: [], brands: [], other_brand_count: 0 };
    expect(insightSummarySchema.parse(empty)).toEqual(empty);
    expect(insightSummarySchema.safeParse({ ...empty, costs: [{ currency: 'USD', amount: 10, priced_items: 1 }] }).success).toBe(false);
    expect(insightSummarySchema.safeParse({ ...empty, wear: { events: null, days: 0, garment_uses: 0 } }).success).toBe(false);
    expect(insightSummarySchema.safeParse({ ...empty, wardrobe: { total: -1 } }).success).toBe(false);
  });
  it('isolates owner, date, period, page, mode and search while sharing an invalidation root', () => {
    const scope = { asOf: '2026-10-28', period: '30' as const };
    const base = insightKeys.list('a', 0, scope, defaultInsightFilters);
    expect(insightKeys.summary('a', scope)).not.toEqual(insightKeys.summary('b', scope));
    expect(insightKeys.summary('a', scope)).not.toEqual(insightKeys.summary('a', { ...scope, period: 'all' }));
    expect(insightKeys.summary('a', scope)).not.toEqual(insightKeys.summary('a', { ...scope, asOf: '2026-10-27' }));
    expect(insightKeys.list('a', 1, scope, defaultInsightFilters)).not.toEqual(base);
    expect(insightKeys.list('a', 0, scope, { ...defaultInsightFilters, mode: 'all' })).not.toEqual(base);
    expect(insightKeys.list('a', 0, scope, { ...defaultInsightFilters, search: '옷' })).not.toEqual(base);
    expect(base.slice(0, 3)).toEqual(insightKeys.root('a'));
    expect(insightErrorMessage(new Error('secret trace'))).not.toContain('secret');
  });
});
