import { describe, expect, it } from 'vitest';
import { clearPrivateCache, createQueryClient } from '../src/lib/query/client';
import { privateQueryKey } from '../src/lib/query/keys';

describe('account cache isolation', () => {
  it('scopes otherwise equal queries to different users', () => {
    expect(privateQueryKey('A', 'wardrobe')).not.toEqual(privateQueryKey('B', 'wardrobe'));
    expect(() => privateQueryKey('', 'wardrobe')).toThrow();
  });
  it('cancels pending work before removing private queries and mutations', async () => {
    const client = createQueryClient();
    const key = privateQueryKey('A', 'wardrobe');
    client.setQueryData(key, ['private item']);
    let aborted = false;
    const pending = client.fetchQuery({
      queryKey: privateQueryKey('A', 'outfits'),
      queryFn: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); })),
    }).catch(() => undefined);
    client.getMutationCache().build(client, { mutationKey: ['A'] });
    await clearPrivateCache(client);
    await pending;
    expect(aborted).toBe(true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    client.clear();
  });
});
