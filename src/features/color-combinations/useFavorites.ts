import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { createColorFavorites, favoriteKey } from './favorites';
import { samePair, type ColorPair } from './finder';

export function useColorFavorites(owner: string) {
  const cache = useQueryClient(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const service = useMemo(() => supabase && publicConfig.status === 'ready' ? createColorFavorites(supabase, owner, publicConfig, expoFetch) : null, [owner]);
  const scope = useRef({ active: true, epoch: 0, request: null as AbortController | null });
  useEffect(() => {
    const current = scope.current; current.active = true; current.epoch++;
    return () => { current.active = false; current.epoch++; current.request?.abort(); };
  }, [owner]);
  const query = useQuery({ queryKey: favoriteKey(owner), queryFn: async ({ signal }) => {
    if (!service) throw new Error('service_unavailable');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) controller.abort(); else signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 15_000);
    try { return await service.list(controller.signal); }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  }, refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
  async function setFavorite(pair: ColorPair, saved: boolean) {
    const current = scope.current;
    if (!service || !current.active || current.request || query.isPending || query.isError) return;
    const epoch = current.epoch; const request = new AbortController(); current.request = request;
    const timeout = setTimeout(() => request.abort(), 15_000);
    setBusy(true); setError(null);
    try {
      await cache.cancelQueries({ queryKey: favoriteKey(owner) });
      await service.set(pair, saved, request.signal);
      if (current.active && epoch === current.epoch) {
        await cache.cancelQueries({ queryKey: favoriteKey(owner) });
        if (current.active && epoch === current.epoch) cache.setQueryData<ColorPair[]>(favoriteKey(owner), (old = []) => saved ? [pair, ...old.filter((entry) => !samePair(entry, pair))] : old.filter((entry) => !samePair(entry, pair)));
      }
    } catch {
      if (current.active && epoch === current.epoch) setError('찜 저장 결과를 확인하지 못했어요. 다시 불러온 뒤 재시도해 주세요.');
    } finally {
      clearTimeout(timeout); current.request = null;
      if (current.active && epoch === current.epoch) { setBusy(false); void cache.invalidateQueries({ queryKey: favoriteKey(owner) }).catch(() => {}); }
    }
  }
  return { query, busy, error, setFavorite, reload: () => { setError(null); void query.refetch(); } };
}
