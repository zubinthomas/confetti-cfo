// Filtered, per-route query over the financial_records fact table (~15k rows
// unfiltered - see server/routes/financialRecords.ts). Pages should filter by
// whatever they actually render (business unit(s) + fiscal year, typically).
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/http';
import type { FinancialRecord } from '@/data/types';
import { hasAnyFilter, sortedFilters, toQueryString } from './queryFilters';

export interface FinancialRecordFilters {
  [key: string]: (string | number)[] | undefined;
  businessUnitId?: number[];
  periodId?: number[];
  lineItemId?: number[];
  fiscalYear?: string[];
  periodType?: ('month' | 'week' | 'custom')[];
}

export function useFinancialRecords(filters: FinancialRecordFilters) {
  const key = sortedFilters(filters);
  return useQuery({
    queryKey: ['financial-records', key],
    queryFn: () => get<FinancialRecord[]>(`/financial-records${toQueryString(key)}`),
    // Avoid an accidental unfiltered full-table fetch - callers must supply
    // at least one filter dimension.
    enabled: hasAnyFilter(key),
    staleTime: 5 * 60 * 1000,
  });
}
