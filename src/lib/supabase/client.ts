import { createClient, processLock } from '@supabase/supabase-js';
import { publicConfig } from '@/lib/config/env';
import { sessionStorage } from './sessionStorage';
import type { Database } from '@/types/database.generated';

export const supabase = publicConfig.status === 'ready'
  ? createClient<Database>(publicConfig.url, publicConfig.key, {
      auth: {
        ...(sessionStorage ? { storage: sessionStorage } : {}),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
        flowType: 'pkce',
      },
    })
  : null;
