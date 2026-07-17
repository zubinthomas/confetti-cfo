// All four craft departments' FY 2025-26 P&L in one query - used by pages
// that need every department at once (the AI context builder), unlike
// CraftDeptPage which only fetches the one department it renders.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { computeDeptFinancials, DEPT_BU, type DeptKey, type DeptFinancials } from '@/data/deptFinancials';

const CRAFT_KEYS: DeptKey[] = ['tradingItems', 'pottery', 'batik', 'stitching'];
const CRAFT_BUS = CRAFT_KEYS.map((k) => DEPT_BU[k]);
const FY = '2025-2026';

export function useCraftFinancials(): Record<DeptKey, DeptFinancials> | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({ businessUnitId: CRAFT_BUS, fiscalYear: [FY] });

  return useMemo(() => {
    if (!ref || !records) return undefined;
    const idx = buildFrIndex(records);
    const periodIds = monthPeriodIds(ref.periods, FY);
    return Object.fromEntries(
      CRAFT_KEYS.map((k) => [k, computeDeptFinancials(idx, k, periodIds)])
    ) as Record<DeptKey, DeptFinancials>;
  }, [ref, records]);
}
