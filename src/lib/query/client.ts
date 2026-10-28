import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

export async function clearPrivateCache(client: QueryClient) {
  await client.cancelQueries();
  client.clear();
}
