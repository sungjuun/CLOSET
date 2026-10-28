import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { useUserId } from '@/providers/AppProviders';
import { insightKeys, type InsightListFilters, type InsightScope } from './model';
import { createInsightRepository, InsightError } from './repository';

function useRepository() {
  const owner = useUserId();
  if (!owner || !supabase || publicConfig.status !== 'ready') throw new InsightError('session_changed');
  return { owner, repository: createInsightRepository(supabase, owner, publicConfig) };
}
export function useInsightSummary(scope: InsightScope) {
  const { owner, repository } = useRepository();
  return useQuery({ queryKey: insightKeys.summary(owner, scope), queryFn: ({ signal }) => repository.summary(scope, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
}
export function useInsightItems(page: number, scope: InsightScope, filters: InsightListFilters) {
  const { owner, repository } = useRepository();
  return useQuery({ queryKey: insightKeys.list(owner, page, scope, filters), queryFn: ({ signal }) => repository.items(page, scope, filters, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always', gcTime: 0 });
}
