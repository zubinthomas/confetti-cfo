// Pure, parametrized craft-department P&L computation - the department
// figures use only the workbook's own reported totals (Total Sales, primary
// purchase cost, Total Expenses, Net Profit & Loss), not a sum over every
// cogs/hr_cost/operating_cost-tagged line item, since the sheet layout mixes
// true totals with overlapping sub-breakdowns per department. Verified
// against the raw data: revenue − totalExpenses === netPL and
// revenue − cogs ≥ netPL for every month in every one of these four
// departments.
//
// Takes an FrIndex (see src/data/seriesKernel.ts) built from a hook-fetched,
// per-route filtered slice of financialRecords (see
// src/components/dashboard/CraftDeptPage.tsx) instead of reading a
// whole-dataset singleton.
import { MONTHS, frGet, series, sum, type FrIndex, type Series } from "./seriesKernel";

export const DEPT_BU = { tradingItems: 3, pottery: 4, batik: 5, stitching: 6 } as const;
export type DeptKey = keyof typeof DEPT_BU;

const DEPT_COGS_LINE_IDS: Record<DeptKey, number[]> = {
  tradingItems: [39],        // Trading Items Purchase
  pottery: [38, 39],         // Raw Materials Purchase + Trading Items Purchase
  batik: [38],               // Raw Materials Purchase
  stitching: [38],           // Raw Materials Purchase
};
const DEPT_TOTAL_SALES_LI = 85;
const DEPT_TOTAL_EXPENSES_LI = 61;
const DEPT_NET_PL_LI = 62;

export interface DeptFinancials {
  months: string[];
  hasMonthlyDetail: boolean;
  revenue: Series;
  cogs: Series;
  grossProfit: Series;
  grossMarginPct: Series;
  totalExpenses: Series;
  opexOther: Series;
  netPL: Series;
  netMarginPct: Series;
}

export function computeDeptFinancials(idx: FrIndex, deptKey: DeptKey, periodIds: number[]): DeptFinancials {
  const buId = DEPT_BU[deptKey];
  const cogsIds = DEPT_COGS_LINE_IDS[deptKey];
  const revenue = series(idx, buId, DEPT_TOTAL_SALES_LI, periodIds);
  const cogs = periodIds.map((pid) => {
    const vals = cogsIds.map((lid) => frGet(idx, buId, pid, lid));
    if (vals.every((v) => v == null)) return null;
    return sum(vals);
  });
  const totalExpenses = series(idx, buId, DEPT_TOTAL_EXPENSES_LI, periodIds);
  const netPL = series(idx, buId, DEPT_NET_PL_LI, periodIds);
  const grossProfit = revenue.map((rv, i) =>
    rv == null || cogs[i] == null ? null : rv - cogs[i]
  );
  const grossMarginPct = grossProfit.map((gp, i) =>
    gp == null || !revenue[i] ? null : Math.round((gp / revenue[i]) * 1000) / 10
  );
  const netMarginPct = netPL.map((np, i) =>
    np == null || !revenue[i] ? null : Math.round((np / revenue[i]) * 1000) / 10
  );
  const opexOther = totalExpenses.map((te, i) =>
    te == null || cogs[i] == null ? null : te - cogs[i]
  );
  return {
    months: MONTHS,
    hasMonthlyDetail: revenue.some((v) => v != null),
    revenue,
    cogs,
    grossProfit,
    grossMarginPct,
    totalExpenses,
    opexOther, // total expenses minus COGS (HR + operating costs combined)
    netPL,
    netMarginPct,
  };
}
