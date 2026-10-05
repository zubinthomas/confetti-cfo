// Multi-year F&B + Store annual history (FY 21-22 -> 25-26) - always shows
// every year, independent of any FY selector.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { resolveFnbBu, resolveFabLi } from '@/data/fabData';
import { resolveStoreBu, resolveStoreLi } from '@/data/storeFinancials';
import { computeFnbStoreHistory, resolveOverviewOvLi, type FnbStoreHistoryYear } from '@/data/overviewData';

const HISTORY_FYS = ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026'];

export function useFnbStoreHistory(): FnbStoreHistoryYear[] | undefined {
  const { data: ref } = useReferenceData();
  const fnbBu = ref ? resolveFnbBu(ref.businessUnits) : null;
  const storeBu = ref ? resolveStoreBu(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({
    businessUnitId: fnbBu != null && storeBu != null ? [fnbBu, storeBu] : undefined,
    fiscalYear: HISTORY_FYS,
  });

  return useMemo(() => {
    if (!ref || !records || fnbBu == null || storeBu == null) return undefined;
    const idx = buildFrIndex(records);
    const fnbLi = resolveFabLi(ref.lineItems);
    const storeLi = resolveStoreLi(ref.lineItems);
    const ovLi = resolveOverviewOvLi(ref.lineItems);
    return computeFnbStoreHistory(
      idx, fnbBu, storeBu, fnbLi, storeLi, ovLi, (fy) => monthPeriodIds(ref.periods, fy)
    );
  }, [ref, records, fnbBu, storeBu]);
}
