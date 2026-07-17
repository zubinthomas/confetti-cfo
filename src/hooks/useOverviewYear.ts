// Cross-business (F&B + Store) overview for one selectable fiscal year, plus
// the previous year (for YoY comparisons).
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { computeOverviewForFY, FNB_BU, STORE_BU, type OverviewYearData } from '@/data/overviewData';

export interface OverviewYear {
  cur: OverviewYearData;
  prev: OverviewYearData | null;
}

export function useOverviewYear(fy: string | undefined, prevFy: string | null | undefined): OverviewYear | undefined {
  const { data: ref } = useReferenceData();
  const years = [fy, prevFy].filter((v): v is string => !!v);
  const { data: records } = useFinancialRecords({
    businessUnitId: fy ? [FNB_BU, STORE_BU] : undefined,
    fiscalYear: years.length ? years : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || !fy) return undefined;
    const idx = buildFrIndex(records);
    const cur = computeOverviewForFY(idx, fy, monthPeriodIds(ref.periods, fy));
    const prev = prevFy ? computeOverviewForFY(idx, prevFy, monthPeriodIds(ref.periods, prevFy)) : null;
    return { cur, prev };
  }, [ref, records, fy, prevFy]);
}
