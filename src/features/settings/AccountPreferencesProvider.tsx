import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { publicConfig } from '@/lib/config/env';
import { supabase } from '@/lib/supabase/client';
import { createAccountPreferencesService, preferenceErrorMessage, preferenceKey, type AccountPreferences, type PreferencesPatch } from './preferences';

type Preferences = {
  profile: AccountPreferences | null; loading: boolean; saving: boolean; error: string | null;
  save: (patch: PreferencesPatch, expected?: AccountPreferences) => Promise<boolean>;
  reload: () => void;
};
const Context = createContext<Preferences | null>(null);
export function useAccountPreferences() {
  const context = useContext(Context);
  if (!context) throw new Error('AccountPreferencesProvider가 필요합니다.');
  return context;
}
export function AccountPreferencesProvider({ owner, children }: PropsWithChildren<{ owner: string | null }>) {
  return <ScopedPreferences key={owner ?? 'signed-out'} owner={owner}>{children}</ScopedPreferences>;
}
function ScopedPreferences({ owner, children }: PropsWithChildren<{ owner: string | null }>) {
  const cache = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useRef({ active: true, epoch: 0, writing: false, requests: new Set<AbortController>() });
  useEffect(() => {
    const scope = lifecycle.current; scope.active = true; scope.epoch++;
    return () => { scope.active = false; scope.epoch++; scope.requests.forEach((request) => request.abort()); };
  }, []);
  const service = owner && supabase && publicConfig.status === 'ready'
    ? createAccountPreferencesService(supabase, owner, publicConfig, (input, init) => expoFetch(input, init)) : null;
  const queryKey = owner ? preferenceKey(owner) : ['account-preferences', 'signed-out'];
  const query = useQuery({ queryKey, enabled: Boolean(service), queryFn: async ({ signal }) => {
    const request = new AbortController();
    const abort = () => request.abort();
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 15_000);
    try { return await service!.load(request.signal); }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  }, staleTime: 60_000, retry: 0, refetchOnMount: 'always', refetchOnWindowFocus: () => !lifecycle.current.writing });
  async function save(patch: PreferencesPatch, expected = query.data) {
    const scope = lifecycle.current;
    if (!scope.active || scope.writing || !service || !expected) return false;
    const epoch = scope.epoch; scope.writing = true; setSaving(true); setError(null);
    const request = new AbortController(); scope.requests.add(request);
    const timeout = setTimeout(() => request.abort(), 15_000);
    try {
      const profile = await service.save(patch, expected, request.signal);
      if (!scope.active || scope.epoch !== epoch) return false;
      await cache.cancelQueries({ queryKey });
      if (!scope.active || scope.epoch !== epoch) return false;
      cache.setQueryData(queryKey, profile);
      return true;
    } catch (cause) {
      if (scope.active && scope.epoch === epoch) {
        setError(preferenceErrorMessage(cause));
        // A failed response may still have committed. Reconcile without losing
        // the screen's local name draft or silently rebasing its expected value.
        void cache.invalidateQueries({ queryKey }).catch(() => {});
      }
      return false;
    } finally {
      clearTimeout(timeout); scope.requests.delete(request);
      if (scope.active && scope.epoch === epoch) { scope.writing = false; setSaving(false); }
    }
  }
  return <Context.Provider value={{ profile: owner ? query.data ?? null : null, loading: Boolean(owner && query.isPending), saving,
    error: error ?? (owner && query.isError ? '저장된 설정을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.' : null),
    save, reload: () => { if (lifecycle.current.writing) return; setError(null); void query.refetch(); },
  }}>{children}</Context.Provider>;
}
