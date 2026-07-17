// Whole-cafe weekly P&L from before the outlet split (business unit 7,
// Apr-Aug 2025) - used only by the Cafe page's pre-split section.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex } from '@/data/seriesKernel';
import { CAFE_BU, cafeEarlyWeeks, buildLi2Lookup, computeCafeEarlyWeekly, type OutletWeek } from '@/data/outletData';

export interface CafeEarlyData {
  weeks: OutletWeek[];
  weekly: ReturnType<typeof computeCafeEarlyWeekly>;
}

export function useCafeEarlyWeekly(): CafeEarlyData | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({ businessUnitId: [CAFE_BU] });

  return useMemo(() => {
    if (!ref || !records) return undefined;
    const weeks = cafeEarlyWeeks(ref.periods);
    const idx = buildFrIndex(records);
    const li2 = buildLi2Lookup(ref.lineItems);
    return { weeks, weekly: computeCafeEarlyWeekly(idx, li2, weeks) };
  }, [ref, records]);
}
