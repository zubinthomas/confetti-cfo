// F&B (CEPL business unit 1) P&L for one selectable fiscal year, with the
// Overview-sheet annual fallback for years with no department-sheet monthly
// detail.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds, fyLabel } from '@/data/seriesKernel';
import { computeFabYear, FNB_BU, type FabYearData } from '@/data/fabData';

export function useFabYear(fy: string | undefined): FabYearData | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({
    businessUnitId: fy ? [FNB_BU] : undefined,
    fiscalYear: fy ? [fy] : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || !fy) return undefined;
    const idx = buildFrIndex(records);
    return computeFabYear(idx, fy, fyLabel(fy), monthPeriodIds(ref.periods, fy));
  }, [ref, records, fy]);
}
