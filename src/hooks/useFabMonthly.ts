// F&B (CEPL "F&B" department) monthly P&L, fixed to FY 2025-26 - the only
// fiscal year with full monthly department detail. For a year-selectable
// version see useFabYear.ts.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { computeFabMonthly, resolveFnbBu, resolveFabLi, type FabMonthly } from '@/data/fabData';

const FY = '2025-2026';

export function useFabMonthly(): FabMonthly | undefined {
  const { data: ref } = useReferenceData();
  const fnbBu = ref ? resolveFnbBu(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({ businessUnitId: fnbBu != null ? [fnbBu] : undefined, fiscalYear: [FY] });

  return useMemo(() => {
    if (!ref || !records || fnbBu == null) return undefined;
    const idx = buildFrIndex(records);
    const li = resolveFabLi(ref.lineItems);
    return computeFabMonthly(idx, fnbBu, li, monthPeriodIds(ref.periods, FY));
  }, [ref, records, fnbBu]);
}
