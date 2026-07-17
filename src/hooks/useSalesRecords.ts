// Filtered, per-route query over the sales_records table (Sienna channel/
// category sales, ~1.8k rows unfiltered - see server/routes/salesRecords.ts).
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/http';
import type { SalesRecord } from '@/data/types';
import { hasAnyFilter, sortedFilters, toQueryString } from './queryFilters';

export interface SalesRecordFilters {
  [key: string]: (string | number)[] | undefined;
  businessUnitId?: number[];
  periodId?: number[];
  channelId?: number[];
  categoryId?: number[];
  fiscalYear?: string[];
}

export function useSalesRecords(filters: SalesRecordFilters) {
  const key = sortedFilters(filters);
  return useQuery({
    queryKey: ['sales-records', key],
    queryFn: () => get<SalesRecord[]>(`/sales-records${toQueryString(key)}`),
    enabled: hasAnyFilter(key),
    // This data only changes via an explicit Import-page commit, which does
    // a full page reload (see ImportPage.tsx's onCommit) - so caching for
    // the whole session, like useReferenceData, is safe.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
