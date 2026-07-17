// Group cash flow (CEPL business units 1-6) for one selectable fiscal year.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { computeCashFlowForFY, type CashFlowYearData } from '@/data/cashFlowFinancials';

const CEPL_UNITS = [1, 2, 3, 4, 5, 6];

export function useCashFlowYear(fy: string | undefined): CashFlowYearData | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({
    businessUnitId: fy ? CEPL_UNITS : undefined,
    fiscalYear: fy ? [fy] : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || !fy) return undefined;
    const idx = buildFrIndex(records);
    return computeCashFlowForFY(idx, ref.lineItems, fy, monthPeriodIds(ref.periods, fy));
  }, [ref, records, fy]);
}
