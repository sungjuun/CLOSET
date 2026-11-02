import { useQuery } from '@tanstack/react-query';
import { publicConfig } from '@/lib/config/env';
import { z } from 'zod';
const settingsSchema = z.object({ disable_signup: z.boolean(), external: z.object({ email: z.boolean() }) });
export function useRegistrationAvailability() {
  return useQuery({ queryKey: ['public-registration', publicConfig.status === 'ready' ? publicConfig.url : 'missing'], enabled: publicConfig.status === 'ready', staleTime: 30_000, queryFn: async ({ signal }) => {
    if (publicConfig.status !== 'ready') throw new Error('backend_missing');
    const result = await fetch(`${publicConfig.url}/auth/v1/settings`, { headers: { apikey: publicConfig.key }, signal });
    if (!result.ok) throw new Error('settings_unavailable');
    const settings = settingsSchema.parse(await result.json()); return !settings.disable_signup && settings.external.email;
  } });
}
