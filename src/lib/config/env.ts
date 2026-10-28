import { parsePublicConfig } from './schema';

// Expo replaces only static EXPO_PUBLIC accesses in the client bundle.
export const publicConfig = parsePublicConfig(
  {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  __DEV__,
);
