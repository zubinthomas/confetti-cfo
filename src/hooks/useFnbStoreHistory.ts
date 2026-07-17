// Multi-year F&B + Store annual history (FY 21-22 -> 25-26) - always shows
// every year, independent of any FY selector.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { computeFnbStoreHistory, FNB_BU, STORE_BU, type FnbStoreHistoryYear } from '@/data/overviewData';

const HISTORY_FYS = ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026'];

export function useFnbStoreHistory(): FnbStoreHistoryYear[] | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({ businessUnitId: [FNB_BU, STORE_BU], fiscalYear: HISTORY_FYS });

  return useMemo(() => {
    if (!ref || !records) return undefined;
    const idx = buildFrIndex(records);
    return computeFnbStoreHistory(idx, (fy) => monthPeriodIds(ref.periods, fy));
  }, [ref, records]);
}
