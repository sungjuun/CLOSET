import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useUserId } from '@/providers/AppProviders';
import { createWardrobeRepository } from './repository';
import { WardrobeError } from './errors';
import type { WardrobeInput } from './schemas';
import type { WardrobeFilters } from './filters';
import type { WardrobeItem } from './types';
import { wardrobeKeys } from './keys';

function useRepository() {
  const userId = useUserId();
  if (!userId || !supabase) throw new WardrobeError('session_changed');
  return { userId, repository: createWardrobeRepository(supabase, userId) };
}

export function useCategories() {
  const { repository } = useRepository();
  return useQuery({ queryKey: ['categories', 'all'], queryFn: ({ signal }) => repository.categories(signal), staleTime: 600_000 });
}
export function useWardrobeFilterOptions() {
  const { userId, repository } = useRepository();
  return useQuery({ queryKey: wardrobeKeys.options(userId), queryFn: ({ signal }) => repository.filterOptions(signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useWardrobeList(page: number, filters: WardrobeFilters) {
  const { userId, repository } = useRepository();
  return useQuery({ queryKey: wardrobeKeys.list(userId, page, filters), queryFn: ({ signal }) => repository.list(page, signal, filters), refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useWardrobeItem(id: string) {
  const { userId, repository } = useRepository();
  return useQuery({ queryKey: wardrobeKeys.item(userId, id), queryFn: ({ signal }) => repository.get(id, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useWardrobeUsage(id: string) {
  const { userId, repository } = useRepository();
  return useQuery({ queryKey: wardrobeKeys.usage(userId, id), queryFn: ({ signal }) => repository.usage(id, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useWardrobeTrash(page: number) {
  const { userId, repository } = useRepository();
  return useQuery({ queryKey: wardrobeKeys.trash(userId, page), queryFn: ({ signal }) => repository.trash(page, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useWardrobeActions() {
  const { userId, repository } = useRepository();
  const cache = useQueryClient();
  const lifecycle = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => {
    const scope = lifecycle.current;
    scope.active = true; scope.epoch++;
    return () => { scope.active = false; scope.epoch++; scope.requests.forEach((request) => request.abort()); };
  }, [userId]);
  async function perform(operation: (backend: typeof repository, signal: AbortSignal) => Promise<WardrobeItem>) {
    const scope = lifecycle.current;
    if (!scope.active) return null;
    const epoch = scope.epoch;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 15_000);
    scope.requests.add(request);
    let item: WardrobeItem | undefined;
    try { item = await operation(repository, request.signal); }
    finally {
      clearTimeout(timeout);
      scope.requests.delete(request);
      if (scope.active && scope.epoch === epoch) {
        await cache.cancelQueries({ queryKey: wardrobeKeys.root(userId) });
        if (scope.active && scope.epoch === epoch) {
          if (item) cache.setQueryData(wardrobeKeys.item(userId, item.id), item.deleted_at ? null : item);
          // Do not keep a form locked while a background read is offline.
          void cache.invalidateQueries({ queryKey: wardrobeKeys.root(userId) }).catch(() => {});
        }
      }
    }
    return scope.active && scope.epoch === epoch ? item ?? null : null;
  }
  return { perform, isActive: () => lifecycle.current.active };
}
export function useCreateWardrobeItem() {
  const { userId, repository } = useRepository();
  const cache = useQueryClient();
  const scope = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => {
    const state = scope.current;
    state.active = true;
    state.epoch++;
    return () => { state.active = false; state.epoch++; state.requests.forEach((request) => request.abort()); };
  }, [userId]);
  return useMutation({
    retry: false,
    mutationFn: async ({ id, input }: { id: string; input: WardrobeInput }) => {
      const state = scope.current;
      if (!state.active) return null;
      const epoch = state.epoch;
      const controller = new AbortController();
      state.requests.add(controller);
      try {
        const item = await repository.create(id, input, controller.signal);
        if (!state.active || epoch !== state.epoch) return null;
        cache.setQueryData(wardrobeKeys.item(userId, item.id), item);
        await cache.invalidateQueries({ queryKey: wardrobeKeys.root(userId) });
        return state.active && epoch === state.epoch ? item : null;
      } finally { state.requests.delete(controller); }
    },
  });
}
