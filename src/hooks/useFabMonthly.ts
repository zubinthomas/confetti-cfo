// F&B (CEPL business unit 1) monthly P&L, fixed to FY 2025-26 - the only
// fiscal year with full monthly department detail. For a year-selectable
// version see useFabYear.ts.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { computeFabMonthly, FNB_BU, type FabMonthly } from '@/data/fabData';

const FY = '2025-2026';

export function useFabMonthly(): FabMonthly | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({ businessUnitId: [FNB_BU], fiscalYear: [FY] });

  return useMemo(() => {
    if (!ref || !records) return undefined;
    const idx = buildFrIndex(records);
    return computeFabMonthly(idx, monthPeriodIds(ref.periods, FY));
  }, [ref, records]);
}
