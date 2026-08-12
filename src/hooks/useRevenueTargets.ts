// Filtered, per-route query over the revenue_targets fact table (24 rows/year
// - Store + F&B main-category monthly targets only, see
// server/routes/revenueTargets.ts).
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/http';
import type { RevenueTarget } from '@/data/types';
import { hasAnyFilter, sortedFilters, toQueryString } from './queryFilters';

export interface RevenueTargetFilters {
  [key: string]: (string | number)[] | undefined;
  periodId?: number[];
  category?: ('store' | 'fnb')[];
  fiscalYear?: string[];
}

export function useRevenueTargets(filters: RevenueTargetFilters) {
  const key = sortedFilters(filters);
  return useQuery({
    queryKey: ['revenue-targets', key],
    queryFn: () => get<RevenueTarget[]>(`/revenue-targets${toQueryString(key)}`),
    enabled: hasAnyFilter(key),
    // Only changes via an Import-page commit (full page reload) - safe to
    // cache for the whole session, same as useFinancialRecords.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
