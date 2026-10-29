import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { wardrobeDraftSchema } from '../src/features/wardrobe/schemas';
import { emptyWardrobeDraft } from '../src/features/wardrobe/types';
import { wardrobeErrorMessage } from '../src/features/wardrobe/errors';
import { createWardrobeRepository } from '../src/features/wardrobe/repository';
import { privateQueryPrefix, privateQueryKey } from '../src/lib/query/keys';
import type { Database } from '../src/types/database.generated';

const owner = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const validDraft = () => ({ ...emptyWardrobeDraft(), name: ' 리넨 셔츠 ', category_slug: 'shirt' });

describe('wardrobe input boundaries', () => {
  it('trims required text and treats empty optional values as null, not zero', () => {
    const parsed = wardrobeDraftSchema.parse(validDraft());
    expect(parsed.name).toBe('리넨 셔츠');
    expect(parsed.purchase_price).toBeNull();
    expect(parsed.purchased_on).toBeNull();
    expect(parsed.brand_name).toBeNull();
    expect(parsed.currency).toBe('KRW');
    expect(wardrobeDraftSchema.parse({ ...validDraft(), purchase_price: '0' }).purchase_price).toBe(0);
  });
  it('accepts grouped won amounts and precision while deduplicating tags/seasons', () => {
    const parsed = wardrobeDraftSchema.parse({ ...validDraft(), purchase_price: '125,000.50', currency: 'KRW', tags: ' 출근, ,출근,여름 ', seasons: ['spring', 'spring'] });
    expect(parsed.purchase_price).toBe(125000.5);
    expect(parsed.currency).toBe('KRW');
    expect(parsed.tags).toEqual(['출근', '여름']);
    expect(parsed.seasons).toEqual(['spring']);
  });
  it.each(['USD', 'EUR', 'JPY', 'krw'])('rejects non-KRW currency %s', (currency) => {
    expect(wardrobeDraftSchema.safeParse({ ...validDraft(), currency }).success).toBe(false);
  });
  it.each(['-1', '1e3', '1,2', '1.001', '10000000000', 'Infinity', 'NaN'])('rejects invalid price %s', (price) => {
    expect(wardrobeDraftSchema.safeParse({ ...validDraft(), purchase_price: price }).success).toBe(false);
  });
  it('validates real calendar dates without timezone conversion', () => {
    expect(wardrobeDraftSchema.parse({ ...validDraft(), purchased_on: '2024-02-29' }).purchased_on).toBe('2024-02-29');
    for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-1']) expect(wardrobeDraftSchema.safeParse({ ...validDraft(), purchased_on: date }).success).toBe(false);
  });
  it.each(['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://example.com/a b'])('rejects unsuitable purchase URL %s', (url) => {
    expect(wardrobeDraftSchema.safeParse({ ...validDraft(), purchase_url: url }).success).toBe(false);
  });
  it('enforces required fields and database-compatible lengths/sets', () => {
    for (const input of [{ name: '  ' }, { category_slug: '' }, { color_hex: 'blue' }, { seasons: ['rain'] }, { tags: Array.from({ length: 21 }, (_, index) => `${index}`).join(',') }, { notes: 'x'.repeat(5001) }]) {
      expect(wardrobeDraftSchema.safeParse({ ...validDraft(), ...input }).success).toBe(false);
    }
  });
  it('never shows raw database messages', () => {
    expect(wardrobeErrorMessage({ message: 'private notes in server detail' })).not.toContain('private');
    expect(wardrobeErrorMessage({ code: '23503' })).toContain('분류');
  });
});

describe('repository network boundary', () => {
  it('sends only allowed fields with the captured owner and keeps server details private', async () => {
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.user_id).toBe(owner);
      expect(body.id).toBe(id);
      expect(body.created_at).toBeUndefined();
      expect(body.deleted_at).toBeUndefined();
      return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } });
    });
    const client = createClient<Database>('https://example.supabase.co', 'public-test-key', { global: { fetch: transport }, auth: { persistSession: false, autoRefreshToken: false } });
    const input = { ...wardrobeDraftSchema.parse(validDraft()), user_id: 'attacker', created_at: 'past', deleted_at: 'now' };
    expect((await createWardrobeRepository(client, owner).create(id, input)).user_id).toBe(owner);
    expect(transport).toHaveBeenCalledOnce();
  });
  it('cancels the HTTP request through the query-provided AbortSignal', async () => {
    const transport = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const client = createClient<Database>('https://example.supabase.co', 'public-test-key', { global: { fetch: transport }, auth: { persistSession: false, autoRefreshToken: false } });
    const controller = new AbortController();
    const pending = createWardrobeRepository(client, owner).get(id, controller.signal);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toBeTruthy();
  });
  it('uses one account prefix for all list/detail invalidations', () => {
    const prefix = privateQueryPrefix(owner, 'wardrobe');
    expect(privateQueryKey(owner, 'wardrobe', { kind: 'item', id }).slice(0, 3)).toEqual(prefix);
    expect(privateQueryKey('another-user', 'wardrobe').slice(0, 3)).not.toEqual(prefix);
  });
});
