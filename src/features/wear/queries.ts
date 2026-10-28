import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { privateQueryKey, privateQueryPrefix } from '@/lib/query/keys';
import { useUserId } from '@/providers/AppProviders';
import { WearError, wearKeys, type WearRange, type WearRecordInput } from './model';
import { createWearRepository } from './repository';

function useRepository() {
  const owner = useUserId();
  if (!owner || !supabase || publicConfig.status !== 'ready') throw new WearError('session_changed');
  return { owner, repository: createWearRepository(supabase, owner, publicConfig) };
}
export function useWearEvent(id: string) {
  const { owner, repository } = useRepository();
  return useQuery({ queryKey: wearKeys.item(owner, id), queryFn: ({ signal }) => repository.get(id, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
}
export function useWearRange(page: number, range: WearRange) {
  const { owner, repository } = useRepository();
  return useQuery({ queryKey: wearKeys.list(owner, page, range), queryFn: ({ signal }) => repository.list(page, range, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
}
export function useWearDayCounts(range: WearRange) {
  const { owner, repository } = useRepository();
  return useQuery({ queryKey: wearKeys.counts(owner, range), queryFn: ({ signal }) => repository.dayCounts(range, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
}
export function useWearSelectedItems(ids: string[]) {
  const { owner, repository } = useRepository();
  return useQuery({ queryKey: privateQueryKey(owner, 'wardrobe', { kind: 'wear-selected', ids: [...ids].sort() }), queryFn: ({ signal }) => repository.selectedItems(ids, signal), enabled: ids.length > 0, refetchInterval: 30_000, refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
}
export function useWearActions() {
  const { owner, repository } = useRepository();
  const cache = useQueryClient();
  const lifecycle = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => {
    const scope = lifecycle.current; scope.active = true; scope.epoch++;
    return () => { scope.active = false; scope.epoch++; scope.requests.forEach((request) => request.abort()); };
  }, [owner]);
  async function perform<T>(operation: (backend: typeof repository, signal: AbortSignal) => Promise<T>) {
    const scope = lifecycle.current;
    if (!scope.active) return null;
    const epoch = scope.epoch;
    const request = new AbortController(); scope.requests.add(request);
    const timeout = setTimeout(() => request.abort(), 15_000);
    let value: T;
    try { value = await operation(repository, request.signal); }
    finally {
      clearTimeout(timeout); scope.requests.delete(request);
      if (scope.active && scope.epoch === epoch) {
        const keys = (['wear', 'wardrobe', 'outfits', 'insights'] as const).map((resource) => privateQueryPrefix(owner, resource));
        await Promise.all(keys.map((queryKey) => cache.cancelQueries({ queryKey })));
        if (scope.active && scope.epoch === epoch) for (const queryKey of keys) void cache.invalidateQueries({ queryKey }).catch(() => {});
      }
    }
    return scope.active && scope.epoch === epoch ? value : null;
  }
  return { perform, isActive: () => lifecycle.current.active };
}
export function useRecordWearEvent() {
  const actions = useWearActions();
  return { record: (id: string, input: WearRecordInput) => actions.perform((repository, signal) => repository.record(id, input, signal)), isActive: actions.isActive };
}
