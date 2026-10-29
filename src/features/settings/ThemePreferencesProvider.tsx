import { focusManager } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { publicConfig } from '@/lib/config/env';
import { supabase } from '@/lib/supabase/client';
import type { ThemeName } from '@/theme/tokens';
import { createThemeController } from './controller';
import { createThemeService } from './service';
import { useSettingsStore } from './store';

type Actions = { select: (theme: ThemeName) => void; reload: () => void };
const Context = createContext<Actions | null>(null);
export function useThemePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('ThemePreferencesProvider가 필요합니다.');
  return value;
}

export function ThemePreferencesProvider({ owner, children }: PropsWithChildren<{ owner: string | null }>) {
  const controller = useRef<ReturnType<typeof createThemeController> | null>(null);
  useEffect(() => {
    if (!owner || !supabase || publicConfig.status !== 'ready' || useSettingsStore.getState().owner !== owner) return;
    const instance = createThemeController(owner, createThemeService(supabase, owner, publicConfig, (input, init) => expoFetch(input, init)), useSettingsStore);
    controller.current = instance;
    void instance.load();
    const unsubscribe = focusManager.subscribe((focused) => { if (focused) void instance.load(); });
    return () => { unsubscribe(); instance.dispose(); if (controller.current === instance) controller.current = null; };
  }, [owner]);
  const actions = useMemo<Actions>(() => ({ select: (theme) => { void controller.current?.select(theme); }, reload: () => { void controller.current?.load(); } }), []);
  return <Context.Provider value={actions}>{children}</Context.Provider>;
}
