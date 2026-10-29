import { z } from 'zod';
import { privateQueryKey, privateQueryPrefix } from '../../lib/query/keys';
import { wearDateSchema } from '../wear/model';
import { formatWon } from '../../lib/format/money';

export const insightPageSize = 20;
export const insightScopeSchema = z.object({ asOf: wearDateSchema, period: z.enum(['all', '30', '90']) });
export type InsightScope = z.infer<typeof insightScopeSchema>;
export const insightListSchema = z.object({ mode: z.enum(['most', 'unrecorded', 'recent', 'all']), search: z.string().trim().max(200) });
export type InsightListFilters = z.infer<typeof insightListSchema>;
export const defaultInsightFilters: InsightListFilters = { mode: 'most', search: '' };
export function insightRange(input: InsightScope) {
  const scope = insightScopeSchema.parse(input);
  if (scope.period === 'all') return { start: null, end: scope.asOf };
  const date = new Date(`${scope.asOf}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Number(scope.period) + 1);
  const start = date.toISOString().slice(0, 10);
  return { start: start < '1900-01-01' ? '1900-01-01' : start, end: scope.asOf };
}
export function insightArgs(input: InsightScope) {
  const scope = insightScopeSchema.parse(input);
  return { p_as_of: scope.asOf, ...(scope.period === 'all' ? {} : { p_days: Number(scope.period) }) };
}
const count = z.number().int().nonnegative();
export const insightSummarySchema = z.object({
  as_of: wearDateSchema, start_on: wearDateSchema.nullable(), days: z.union([z.literal(30), z.literal(90)]).nullable(),
  wardrobe: z.object({ total: count, active: count, archived: count, sold: count, donated: count, priced: count, unpriced: count, recorded: count, unrecorded: count, never_recorded: count }),
  wear: z.object({ events: count, days: count, garment_uses: count }),
  costs: z.array(z.object({ currency: z.literal('KRW'), amount: z.number().nonnegative(), priced_items: count })),
  categories: z.array(z.object({ slug: z.string(), name: z.string(), count })),
  brands: z.array(z.object({ name: z.string().nullable(), count })), other_brand_count: count,
});
export type InsightSummary = z.infer<typeof insightSummarySchema>;
export function insightCostLabel(item: { purchase_price: number | null; lifetime_wear_count: number; cost_per_wear: number | null; currency: string }) {
  if (item.purchase_price === null) return '가격 미입력';
  if (item.lifetime_wear_count === 0) return '기록 없음';
  return formatWon(item.cost_per_wear);
}
export const insightKeys = {
  root: (owner: string) => privateQueryPrefix(owner, 'insights'),
  summary: (owner: string, scope: InsightScope) => privateQueryKey(owner, 'insights', { kind: 'summary', ...insightScopeSchema.parse(scope) }),
  list: (owner: string, page: number, scope: InsightScope, filters: InsightListFilters) => privateQueryKey(owner, 'insights', { kind: 'items', page, ...insightScopeSchema.parse(scope), ...insightListSchema.parse(filters) }),
};
