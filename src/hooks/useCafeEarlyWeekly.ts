// Whole-cafe weekly P&L from before the outlet split (business "Cafe"
// department, Apr-Aug 2025) - used only by the Cafe page's pre-split
// section.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex } from '@/data/seriesKernel';
import { resolveCafeBu, cafeEarlyWeeks, buildLi2Lookup, computeCafeEarlyWeekly, type OutletWeek } from '@/data/outletData';

export interface CafeEarlyData {
  weeks: OutletWeek[];
  weekly: ReturnType<typeof computeCafeEarlyWeekly>;
}

export function useCafeEarlyWeekly(): CafeEarlyData | undefined {
  const { data: ref } = useReferenceData();
  const cafeBu = ref ? resolveCafeBu(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({ businessUnitId: cafeBu != null ? [cafeBu] : undefined });

  return useMemo(() => {
    if (!ref || !records || cafeBu == null) return undefined;
    const weeks = cafeEarlyWeeks(ref.periods);
    const idx = buildFrIndex(records);
    const li2 = buildLi2Lookup(ref.lineItems);
    return { weeks, weekly: computeCafeEarlyWeekly(idx, li2, cafeBu, weeks) };
  }, [ref, records, cafeBu]);
}
