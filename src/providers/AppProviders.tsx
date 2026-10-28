import type { Session } from '@supabase/supabase-js';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { clearPrivateCache, createQueryClient } from '@/lib/query/client';
import { supabase } from '@/lib/supabase/client';

type AuthState = {
  userId: string | null;
  pending: boolean;
  failed: boolean;
  recoveryRequired: boolean;
  finishRecovery: () => void;
  retry: () => void;
};
const IdentityContext = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(IdentityContext);
  if (!value) throw new Error('AppProviders가 필요합니다.');
  return value;
}
export const useUserId = () => useAuth().userId;

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  const [userId, setUserId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(Boolean(supabase));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recoveryRequired, setRecoveryRequired] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let disposed = false;
    let revision = 0;
    let owner: string | null | undefined;
    let queue = Promise.resolve();

    const applySession = (session: Session | null) => {
      const current = ++revision;
      const next = session?.user.id ?? null;
      if (owner !== next) setBlocked(true);
      if (!next) setRecoveryRequired(false);
      // Leave the auth callback immediately; never await another Auth operation in it.
      queue = queue.then(async () => {
        if (disposed) return;
        if (owner !== next) await clearPrivateCache(queryClient);
        owner = next;
        if (!disposed && current === revision) {
          setUserId(next);
          setBlocked(false);
        }
      }).catch(() => {
        if (!disposed) setFailed(true);
      });
    };
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryRequired(true);
      applySession(session);
    });
    const initialRevision = revision;
    void client.auth.getSession().then(({ data: restored, error }) => {
      if (disposed || revision !== initialRevision) return;
      if (error) setFailed(true);
      else applySession(restored.session);
    }).catch(() => { if (!disposed) setFailed(true); });

    const refresh = (state: string | null | undefined) => {
      focusManager.setFocused(state === 'active');
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const subscription = Platform.OS !== 'web' ? AppState.addEventListener('change', refresh) : null;
    if (Platform.OS !== 'web') refresh(AppState.currentState);
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
      subscription?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
    };
  }, [queryClient, attempt]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <IdentityContext.Provider value={{
          userId, pending: blocked, failed, recoveryRequired,
          finishRecovery: () => setRecoveryRequired(false),
          retry: () => { setFailed(false); setBlocked(true); setAttempt((value) => value + 1); },
        }}>
          {children}
        </IdentityContext.Provider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
