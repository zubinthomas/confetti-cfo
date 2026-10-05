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
// whole-dataset singleton. Business-unit and line-item ids are resolved by
// name from live reference data - see the header note in fabData.ts for why.
import { MONTHS, frGet, series, sum, type FrIndex, type Series } from "./seriesKernel";
import type { BusinessUnit, LineItem } from "./types";

export const CEPL_ID = 1;

const DEPT_BU_NAMES = { tradingItems: "Trading Items", pottery: "Pottery", batik: "Batik", stitching: "Stitching" } as const;
export type DeptKey = keyof typeof DEPT_BU_NAMES;

export function resolveDeptBu(businessUnits: BusinessUnit[]): Record<DeptKey, number> {
  const byName = new Map(businessUnits.filter((u) => u.businessId === CEPL_ID).map((u) => [u.name, u.id]));
  const out = {} as Record<DeptKey, number>;
  for (const key of Object.keys(DEPT_BU_NAMES) as DeptKey[]) {
    out[key] = byName.get(DEPT_BU_NAMES[key]) ?? -1;
  }
  return out;
}

const DEPT_COGS_LINE_NAMES: Record<DeptKey, string[]> = {
  tradingItems: ["Trading Items Purchase"],
  pottery: ["Raw Materials Purchase", "Trading Items Purchase"],
  batik: ["Raw Materials Purchase"],
  stitching: ["Raw Materials Purchase"],
};
const DEPT_TOTAL_SALES_NAME = "Total Sales";
const DEPT_TOTAL_EXPENSES_NAME = "Total Expenses";
const DEPT_NET_PL_NAME = "Net Profit & Loss";

export interface DeptLi {
  cogsIds: Record<DeptKey, number[]>;
  totalSales: number | null;
  totalExpenses: number | null;
  netPL: number | null;
}

export function resolveDeptLi(lineItems: LineItem[]): DeptLi {
  const byName = new Map(lineItems.filter((l) => l.businessId === CEPL_ID).map((l) => [l.name, l.id]));
  const cogsIds = {} as Record<DeptKey, number[]>;
  for (const key of Object.keys(DEPT_COGS_LINE_NAMES) as DeptKey[]) {
    cogsIds[key] = DEPT_COGS_LINE_NAMES[key].map((n) => byName.get(n)).filter((id): id is number => id != null);
  }
  return {
    cogsIds,
    totalSales: byName.get(DEPT_TOTAL_SALES_NAME) ?? null,
    totalExpenses: byName.get(DEPT_TOTAL_EXPENSES_NAME) ?? null,
    netPL: byName.get(DEPT_NET_PL_NAME) ?? null,
  };
}

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

export function computeDeptFinancials(
  idx: FrIndex, buId: number, li: DeptLi, deptKey: DeptKey, periodIds: number[]
): DeptFinancials {
  const cogsIds = li.cogsIds[deptKey];
  const revenue = series(idx, buId, li.totalSales, periodIds);
  const cogs = periodIds.map((pid) => {
    const vals = cogsIds.map((lid) => frGet(idx, buId, pid, lid));
    if (vals.every((v) => v == null)) return null;
    return sum(vals);
  });
  const totalExpenses = series(idx, buId, li.totalExpenses, periodIds);
  const netPL = series(idx, buId, li.netPL, periodIds);
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
