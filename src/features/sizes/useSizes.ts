import { useQuery } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { publicConfig } from '@/lib/config/env';
import { privateQueryKey } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { useUserId } from '@/providers/AppProviders';
import { createSizeService } from './service';

export function useSizes() {
  const owner = useUserId();
  if (!owner || !supabase || publicConfig.status !== 'ready') throw new Error('로그인 후 사이즈를 확인할 수 있어요.');

  const key = privateQueryKey(owner, 'sizes');
  const service = createSizeService(supabase, owner, publicConfig, (input, init) => expoFetch(input, init));
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const request = new AbortController();
      const abort = () => request.abort();
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 15_000);
      try {
        return await service.load(request.signal);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
    },
    gcTime: 0,
  });
  return { key, query, service };
}
