// Group cash flow (all six CEPL departments) for one selectable fiscal year.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { resolveFnbBu } from '@/data/fabData';
import { resolveStoreBu } from '@/data/storeFinancials';
import { resolveDeptBu } from '@/data/deptFinancials';
import { computeCashFlowForFY, resolveCashFlowIds, type CashFlowYearData } from '@/data/cashFlowFinancials';

export function useCashFlowYear(fy: string | undefined): CashFlowYearData | undefined {
  const { data: ref } = useReferenceData();
  const cashFlowUnits = ref
    ? [resolveFnbBu(ref.businessUnits), resolveStoreBu(ref.businessUnits), ...Object.values(resolveDeptBu(ref.businessUnits))]
    : undefined;
  const { data: records } = useFinancialRecords({
    businessUnitId: fy ? cashFlowUnits : undefined,
    fiscalYear: fy ? [fy] : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || !fy) return undefined;
    const idx = buildFrIndex(records);
    const ids = resolveCashFlowIds(ref.businessUnits, ref.lineItems);
    return computeCashFlowForFY(idx, ids, ref.lineItems, fy, monthPeriodIds(ref.periods, fy));
  }, [ref, records, fy]);
}
