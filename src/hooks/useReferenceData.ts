// The small "dimension" tables (businesses, business units, periods, line
// items, categories, channels, vendors) - loaded once per session, since
// they rarely change. See src/hooks/useFinancialRecords.ts et al. for the
// filtered, per-route fact-table queries.
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/http';
import type {
  Business, BusinessUnit, Period, LineItem, Category, Channel, Vendor,
} from '@/data/types';

export interface ReferenceData {
  businesses: Business[];
  businessUnits: BusinessUnit[];
  periods: Period[];
  lineItems: LineItem[];
  categories: Category[];
  channels: Channel[];
  vendors: Vendor[];
}

export function useReferenceData() {
  return useQuery({
    queryKey: ['reference'],
    queryFn: () => get<ReferenceData>('/reference'),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
