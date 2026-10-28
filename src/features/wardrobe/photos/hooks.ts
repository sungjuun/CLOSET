import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { privateQueryKey, privateQueryPrefix } from '@/lib/query/keys';
import { useUserId } from '@/providers/AppProviders';
import { createPhotoService } from './service';
import { PhotoError } from './model';

function useService() {
  const userId = useUserId();
  if (!userId || !supabase || publicConfig.status !== 'ready') throw new PhotoError('session_changed');
  return { userId, service: createPhotoService(supabase,userId,publicConfig,(input,init) => expoFetch(input,init)) };
}
export function usePhotos(itemIds: string[]) {
  const { userId, service } = useService();
  return useQuery({
    queryKey: privateQueryKey(userId,'wardrobe',{ kind: 'photos', ids: [...itemIds].sort() }),
    queryFn: ({ signal }) => service.list(itemIds,signal), enabled: itemIds.length > 0,
    staleTime: 40_000, gcTime: 0, refetchInterval: 45_000,
    refetchOnMount: 'always', refetchOnWindowFocus: 'always',
  });
}
export function usePhotoActions() {
  const { userId, service } = useService();
  const cache = useQueryClient();
  const lifecycle = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => {
    const scope = lifecycle.current;
    scope.active = true; scope.epoch++;
    return () => { scope.active = false; scope.epoch++; scope.requests.forEach((controller) => controller.abort()); };
  },[userId]);
  async function perform<T>(operation: (backend: typeof service, signal: AbortSignal) => Promise<T>) {
    const scope = lifecycle.current;
    if (!scope.active) return null;
    const epoch = scope.epoch;
    const controller = new AbortController();
    scope.requests.add(controller);
    let value: T;
    try {
      value = await operation(service,controller.signal);
    } finally {
      scope.requests.delete(controller);
      // Failed uploads can still leave a reservation or a committed object.
      if (scope.active && scope.epoch === epoch) await cache.invalidateQueries({ queryKey: privateQueryPrefix(userId,'wardrobe') });
    }
    return scope.active && scope.epoch === epoch ? { value } : null;
  }
  return { perform, isActive: () => lifecycle.current.active };
}
