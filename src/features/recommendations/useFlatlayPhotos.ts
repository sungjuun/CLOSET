import { useQueries } from '@tanstack/react-query';
import { privateQueryKey } from '@/lib/query/keys';
import { useUserId } from '@/providers/AppProviders';
import { prepareFlatlayPhoto } from './cutout';
import type { RenderPhoto } from './renderModel';

export function useFlatlayPhotos(photos: RenderPhoto[]) {
  const owner = useUserId()!;
  const queries = useQueries({ queries: photos.map((photo) => ({
    // Original paths are immutable. Strip expiring signatures from cache keys;
    // one owned cutout is shared across cards and removed on session teardown.
    queryKey: privateQueryKey(owner, 'recommendations', { kind: 'flatlay-photo-v1', item: photo.itemId, path: photo.uri.split('?')[0] }),
    queryFn: ({ signal }: { signal: AbortSignal }) => prepareFlatlayPhoto(photo.uri, signal),
    staleTime: Infinity, gcTime: 0, retry: 1,
  })) });
  return { preparing: queries.some((query) => query.isPending), photos: photos.flatMap((photo, index) => { const query = queries[index]!; return query.isPending ? [] : [{ ...photo, uri: query.data ?? photo.uri }]; }), failed: queries.some((query) => query.isError) };
}
