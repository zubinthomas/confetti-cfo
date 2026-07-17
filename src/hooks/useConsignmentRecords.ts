// Filtered, per-route query over the consignment_records table (~0.8k rows
// unfiltered - see server/routes/consignmentRecords.ts).
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/http';
import type { ConsignmentRecord } from '@/data/types';
import { hasAnyFilter, sortedFilters, toQueryString } from './queryFilters';

export interface ConsignmentRecordFilters {
  [key: string]: (string | number)[] | undefined;
  periodId?: number[];
  vendorId?: number[];
  fiscalYear?: string[];
}

export function useConsignmentRecords(filters: ConsignmentRecordFilters) {
  const key = sortedFilters(filters);
  return useQuery({
    queryKey: ['consignment-records', key],
    queryFn: () => get<ConsignmentRecord[]>(`/consignment-records${toQueryString(key)}`),
    enabled: hasAnyFilter(key),
    // This data only changes via an explicit Import-page commit, which does
    // a full page reload (see ImportPage.tsx's onCommit) - so caching for
    // the whole session, like useReferenceData, is safe.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
