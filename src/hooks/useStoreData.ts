// Sienna store P&L page data: channel breakdown, category mix, multi-year
// revenue history, and the Store department's cost structure (CEPL P&L
// sheet).
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useSalesRecords } from './useSalesRecords';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds, fyLabel, MONTHS } from '@/data/seriesKernel';
import {
  computeChannelBreakdown, computeChannelTotals, computeCategoriesForFY,
  computeStoreRevenue, computeFirstMonthRevenue,
} from '@/data/storeSalesData';
import { computeStoreYear, STORE_BU, type StoreDeptYearData } from '@/data/storeFinancials';

export const STORE_FYS = ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026'];
const ALL_FYS = [...STORE_FYS, '2026-2027'];

export interface StoreSalesYearData {
  fy: string;
  label: string;
  months: string[];
  channels: Record<string, number[]>;
  totals: Record<string, number>;
}

export interface StoreData {
  siennaStore: {
    fy2526: { months: string[]; channels: Record<string, number[]>; totals: Record<string, number> };
    fy2627: { months: string[]; channels: Record<string, number[]>; totals: Record<string, number> };
  };
  categoriesByFy: Record<string, ReturnType<typeof computeCategoriesForFY>>;
  storeSalesByFy: Record<string, StoreSalesYearData>;
  storeHistory: { fy: string; label: string; total: number; method: 'channel' }[];
  aprilByFy: Record<string, number>;
  storeFinancialsByFy: Record<string, StoreDeptYearData>;
}

export function useStoreData(): StoreData | undefined {
  const { data: ref } = useReferenceData();
  const { data: sales } = useSalesRecords({ fiscalYear: ALL_FYS });
  const { data: financial } = useFinancialRecords({ businessUnitId: [STORE_BU], fiscalYear: ALL_FYS });

  return useMemo(() => {
    if (!ref || !sales || !financial) return undefined;
    const frIdx = buildFrIndex(financial);
    const pidsFor = (fy: string) => monthPeriodIds(ref.periods, fy);

    const fy2627Pids = ref.periods
      .filter((p) => p.periodType === 'month' && p.fiscalYear === '2026-2027' && p.id <= 58)
      .sort((a, b) => a.id - b.id)
      .map((p) => p.id);

    const fy2526Channels = computeChannelBreakdown(sales, ref.channels, pidsFor('2025-2026'));
    const fy2627Channels = computeChannelBreakdown(sales, ref.channels, fy2627Pids);

    const storeSalesByFy: Record<string, StoreSalesYearData> = {};
    for (const fy of STORE_FYS) {
      const ch = computeChannelBreakdown(sales, ref.channels, pidsFor(fy));
      storeSalesByFy[fy] = { fy, label: fyLabel(fy), months: MONTHS, channels: ch, totals: computeChannelTotals(ch) };
    }

    const categoriesByFy: Record<string, ReturnType<typeof computeCategoriesForFY>> = {};
    for (const fy of STORE_FYS) categoriesByFy[fy] = computeCategoriesForFY(sales, ref.categories, pidsFor(fy));

    const storeHistory = [
      { fy: '2021-2022', label: 'FY 21-22' },
      { fy: '2022-2023', label: 'FY 22-23' },
      { fy: '2023-2024', label: 'FY 23-24' },
      { fy: '2024-2025', label: 'FY 24-25' },
      { fy: '2025-2026', label: 'FY 25-26' },
      { fy: '2026-2027', label: 'FY 26-27 (Apr–May)' },
    ].map(({ fy, label }) => ({ fy, label, ...computeStoreRevenue(sales, pidsFor(fy)) }));

    const aprilByFy: Record<string, number> = {};
    for (const fy of STORE_FYS) {
      const v = computeFirstMonthRevenue(sales, pidsFor(fy));
      if (v != null) aprilByFy[fy] = v;
    }

    const storeFinancialsByFy: Record<string, StoreDeptYearData> = {};
    for (const fy of STORE_FYS) {
      storeFinancialsByFy[fy] = computeStoreYear(frIdx, fy, fyLabel(fy), pidsFor(fy));
    }

    return {
      siennaStore: {
        fy2526: { months: MONTHS, channels: fy2526Channels, totals: computeChannelTotals(fy2526Channels) },
        fy2627: { months: ['Apr', 'May'], channels: fy2627Channels, totals: computeChannelTotals(fy2627Channels) },
      },
      categoriesByFy,
      storeSalesByFy,
      storeHistory,
      aprilByFy,
      storeFinancialsByFy,
    };
  }, [ref, sales, financial]);
}
