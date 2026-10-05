// F&B (CEPL "F&B" department) P&L for one selectable fiscal year, with the
// Overview-sheet annual fallback for years with no department-sheet monthly
// detail.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds, fyLabel } from '@/data/seriesKernel';
import { computeFabYear, resolveFnbBu, resolveFabLi, resolveFabOvLi, type FabYearData } from '@/data/fabData';

export function useFabYear(fy: string | undefined): FabYearData | undefined {
  const { data: ref } = useReferenceData();
  const fnbBu = ref ? resolveFnbBu(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({
    businessUnitId: fy && fnbBu != null ? [fnbBu] : undefined,
    fiscalYear: fy ? [fy] : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || !fy || fnbBu == null) return undefined;
    const idx = buildFrIndex(records);
    const li = resolveFabLi(ref.lineItems);
    const ovLi = resolveFabOvLi(ref.lineItems);
    return computeFabYear(idx, fnbBu, li, ovLi, fy, fyLabel(fy), monthPeriodIds(ref.periods, fy));
  }, [ref, records, fy, fnbBu]);
}
