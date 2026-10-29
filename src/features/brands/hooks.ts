import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { privateQueryKey, privateQueryPrefix } from '@/lib/query/keys';
import { useUserId } from '@/providers/AppProviders';
import { PhotoError } from '../wardrobe/photos/model';
import { createBrandService } from './service';
import type { Brand } from './model';

function useService() {
  const owner = useUserId();
  if (!owner || !supabase || publicConfig.status !== 'ready') throw new PhotoError('session_changed');
  return { owner, service: createBrandService(supabase, owner, publicConfig, (input, init) => expoFetch(input, init)) };
}
export function useBrands() {
  const { owner, service } = useService();
  return useQuery({ queryKey: privateQueryKey(owner, 'brands', { kind: 'list' }), queryFn: ({ signal }) => service.list(signal), gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useBrandImages(brands: readonly Brand[]) {
  const { owner, service } = useService();
  return useQuery({ queryKey: privateQueryKey(owner, 'brands', { kind: 'images', paths: brands.map((brand) => brand.image_path).filter(Boolean).sort() }), queryFn: ({ signal }) => service.images(brands, signal), enabled: brands.some((brand) => brand.image_path), gcTime: 0, staleTime: 40_000, refetchInterval: 45_000, refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
}
export function useBrandActions() {
  const { owner, service } = useService();
  const cache = useQueryClient();
  const lifecycle = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => {
    const state = lifecycle.current;
    state.active = true; state.epoch++;
    return () => { state.active = false; state.epoch++; state.requests.forEach((request) => request.abort()); };
  }, [owner]);
  async function perform<T>(operation: (backend: typeof service, signal: AbortSignal) => Promise<T>) {
    const state = lifecycle.current;
    if (!state.active) return null;
    const epoch = state.epoch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    state.requests.add(controller);
    let value: T;
    try {
      value = await operation(service, controller.signal);
    } finally {
      clearTimeout(timer); state.requests.delete(controller);
      if (state.active && state.epoch === epoch) {
        const keys = (['brands', 'wardrobe', 'outfits', 'insights', 'wear'] as const).map((feature) => privateQueryPrefix(owner, feature));
        await Promise.all(keys.map((queryKey) => cache.cancelQueries({ queryKey })));
        if (state.active && state.epoch === epoch) keys.forEach((queryKey) => { void cache.invalidateQueries({ queryKey }).catch(() => {}); });
      }
    }
    return state.active && state.epoch === epoch ? { value } : null;
  }
  return { perform, isActive: () => lifecycle.current.active };
}
