import { useEffect, useMemo, useRef } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { privateQueryPrefix } from '@/lib/query/keys';
import { createRecommendationService } from './service';

export function useRecommendationActions(owner: string) {
  const cache = useQueryClient();
  const service = useMemo(() => {
    if (!supabase || publicConfig.status !== 'ready') throw new Error('service_unavailable');
    return createRecommendationService(supabase, owner, publicConfig, (input, init) => expoFetch(input, init));
  }, [owner]);
  const lifecycle = useRef({ active: true, epoch: 0, requests: new Set<AbortController>() });
  useEffect(() => { const state = lifecycle.current; state.active = true; state.epoch++; return () => { state.active = false; state.epoch++; state.requests.forEach((request) => request.abort()); }; }, [owner]);
  async function run<T>(operation: (api: typeof service, signal: AbortSignal) => Promise<T>) {
    const state = lifecycle.current; if (!state.active) return null;
    const epoch = state.epoch; const request = new AbortController(); state.requests.add(request); const timer = setTimeout(() => request.abort(), 60_000);
    try { const value = await operation(service, request.signal); return state.active && state.epoch === epoch ? { value } : null; }
    finally { clearTimeout(timer); state.requests.delete(request); }
  }
  const refresh = () => Promise.all([cache.invalidateQueries({ queryKey: privateQueryPrefix(owner, 'outfits') }), cache.invalidateQueries({ queryKey: privateQueryPrefix(owner, 'recommendations') })]);
  return { service, run, refresh, active: () => lifecycle.current.active };
}
