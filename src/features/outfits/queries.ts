import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { privateQueryKey, privateQueryPrefix } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { useUserId } from '@/providers/AppProviders';
import { createOutfitSelectionService, OutfitSelectionError } from './selection';
import type { OutfitSlot } from './draft';
import type { WardrobeFilters } from '../wardrobe/filters';

function useSelectionService() {
  const owner = useUserId();
  if (!supabase || !owner) throw new OutfitSelectionError('session_changed');
  return { owner, service: createOutfitSelectionService(supabase, owner) };
}
export function useOutfitCandidates(slot: OutfitSlot, page: number, filters: WardrobeFilters) {
  const { owner, service } = useSelectionService();
  return useQuery({ queryKey: privateQueryKey(owner, 'wardrobe', { kind: 'outfit-candidates', slot, page, ...filters }), queryFn: ({ signal }) => service.candidates(slot, page, filters, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
}
export function useSelectedOutfitItems(ids: string[]) {
  const { owner, service } = useSelectionService();
  return useQuery({ queryKey: privateQueryKey(owner, 'wardrobe', { kind: 'outfit-selected', ids: [...ids].sort() }), queryFn: ({ signal }) => service.selected(ids, signal), enabled: ids.length > 0, gcTime: 0, refetchInterval: 30_000, refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useOutfitSelectionActions() {
  const { owner, service } = useSelectionService();
  const cache = useQueryClient();
  const scope = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => {
    const current = scope.current; current.active = true; current.epoch++;
    return () => { current.active = false; current.epoch++; current.requests.forEach((request) => request.abort()); };
  }, []);
  async function run<T>(operation: (backend: typeof service, signal: AbortSignal) => Promise<T>) {
    if (!scope.current.active) return null;
    const epoch = scope.current.epoch;
    const request = new AbortController(); scope.current.requests.add(request);
    const timeout = setTimeout(() => request.abort(), 15_000);
    try {
      const value = await operation(service, request.signal);
      return scope.current.active && scope.current.epoch === epoch ? { value } : null;
    } finally { clearTimeout(timeout); scope.current.requests.delete(request); }
  }
  return { run, isActive: () => scope.current.active, refresh: () => scope.current.active ? cache.invalidateQueries({ queryKey: privateQueryPrefix(owner, 'wardrobe'), predicate: (query) => ['outfit-selected', 'outfit-candidates'].includes(String((query.queryKey[3] as { kind?: string } | undefined)?.kind)) }) : Promise.resolve() };
}
