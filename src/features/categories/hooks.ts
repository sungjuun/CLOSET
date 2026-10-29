import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { privateQueryPrefix } from '@/lib/query/keys';
import { useUserId } from '@/providers/AppProviders';
import { CategoryError, createCategoryService } from './service';

export function useCategoryActions() {
  const owner = useUserId();
  if (!owner || !supabase || publicConfig.status !== 'ready') throw new CategoryError('session_changed');
  const service = createCategoryService(supabase, owner, publicConfig, (input, init) => expoFetch(input, init));
  const cache = useQueryClient();
  const lifecycle = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => {
    const state = lifecycle.current; state.active = true; state.epoch++;
    return () => { state.active = false; state.epoch++; state.requests.forEach((request) => request.abort()); };
  }, [owner]);
  async function perform<T>(operation: (backend: typeof service, signal: AbortSignal) => Promise<T>) {
    const state = lifecycle.current;
    if (!state.active) return null;
    const epoch = state.epoch;
    const request = new AbortController(); state.requests.add(request);
    const timeout = setTimeout(() => request.abort(), 15_000);
    let value: T;
    try { value = await operation(service, request.signal); }
    finally {
      clearTimeout(timeout); state.requests.delete(request);
      if (state.active && state.epoch === epoch) {
        const keys = (['categories', 'wardrobe', 'outfits', 'insights', 'wear'] as const).map((resource) => privateQueryPrefix(owner!, resource));
        await Promise.all(keys.map((queryKey) => cache.cancelQueries({ queryKey })));
        if (state.active && state.epoch === epoch) keys.forEach((queryKey) => { void cache.invalidateQueries({ queryKey }).catch(() => {}); });
      }
    }
    return state.active && state.epoch === epoch ? { value } : null;
  }
  return { perform, isActive: () => lifecycle.current.active };
}
