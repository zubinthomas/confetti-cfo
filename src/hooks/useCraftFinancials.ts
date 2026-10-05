// All four craft departments' FY 2025-26 P&L in one query - used by pages
// that need every department at once (the AI context builder), unlike
// CraftDeptPage which only fetches the one department it renders.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex, monthPeriodIds } from '@/data/seriesKernel';
import { computeDeptFinancials, resolveDeptBu, resolveDeptLi, type DeptKey, type DeptFinancials } from '@/data/deptFinancials';

const CRAFT_KEYS: DeptKey[] = ['tradingItems', 'pottery', 'batik', 'stitching'];
const FY = '2025-2026';

export function useCraftFinancials(): Record<DeptKey, DeptFinancials> | undefined {
  const { data: ref } = useReferenceData();
  const deptBu = ref ? resolveDeptBu(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({
    businessUnitId: deptBu ? CRAFT_KEYS.map((k) => deptBu[k]) : undefined, fiscalYear: [FY],
  });

  return useMemo(() => {
    if (!ref || !records || !deptBu) return undefined;
    const idx = buildFrIndex(records);
    const deptLi = resolveDeptLi(ref.lineItems);
    const periodIds = monthPeriodIds(ref.periods, FY);
    return Object.fromEntries(
      CRAFT_KEYS.map((k) => [k, computeDeptFinancials(idx, deptBu[k], deptLi, k, periodIds)])
    ) as Record<DeptKey, DeptFinancials>;
  }, [ref, records, deptBu]);
}
