// Cross-business (F&B + Store) overview for one selectable fiscal year, plus
// the previous year (for YoY comparisons).
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { resolveFnbBu, resolveFabLi } from '@/data/fabData';
import { resolveStoreBu, resolveStoreLi } from '@/data/storeFinancials';
import { computeOverviewForFY, resolveOverviewOvLi, type OverviewYearData } from '@/data/overviewData';

export interface OverviewYear {
  cur: OverviewYearData;
  prev: OverviewYearData | null;
}

export function useOverviewYear(fy: string | undefined, prevFy: string | null | undefined): OverviewYear | undefined {
  const { data: ref } = useReferenceData();
  const fnbBu = ref ? resolveFnbBu(ref.businessUnits) : null;
  const storeBu = ref ? resolveStoreBu(ref.businessUnits) : null;
  const years = [fy, prevFy].filter((v): v is string => !!v);
  const { data: records } = useFinancialRecords({
    businessUnitId: fy && fnbBu != null && storeBu != null ? [fnbBu, storeBu] : undefined,
    fiscalYear: years.length ? years : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || !fy || fnbBu == null || storeBu == null) return undefined;
    const idx = buildFrIndex(records);
    const fnbLi = resolveFabLi(ref.lineItems);
    const storeLi = resolveStoreLi(ref.lineItems);
    const ovLi = resolveOverviewOvLi(ref.lineItems);
    const cur = computeOverviewForFY(idx, fnbBu, storeBu, fnbLi, storeLi, ovLi, fy, monthPeriodIds(ref.periods, fy));
    const prev = prevFy
      ? computeOverviewForFY(idx, fnbBu, storeBu, fnbLi, storeLi, ovLi, prevFy, monthPeriodIds(ref.periods, prevFy))
      : null;
    return { cur, prev };
  }, [ref, records, fy, prevFy, fnbBu, storeBu]);
}
