// Company-wide P&L (Tally business unit "Profit & Loss", pushed by the
// Tally agent) - unlike the craft departments, this unit has no pre-computed
// "Total Sales"/"Total Expenses"/"Net Profit & Loss" line items, just 51 raw
// Tally ledger groups each tagged with a real LineItemCategory (see
// server/db/seed-tally-pl-and-missing-bs.ts). So the P&L here is built by
// summing line items by category, not by looking up named totals.
//
// Sign convention (confirmed against live staging data): revenue is
// positive, cogs/hr_cost/operating_cost are already negative (the Tally
// agent pushes raw closing-minus-opening ledger deltas, not expense
// magnitudes - see server/tally/sync.ts). So every category is summed with
// a plain "+", never subtracted - subtracting an already-negative expense
// would double it back into a profit.
import { MONTHS, frGet, series, sum, type FrIndex, type Series } from "./seriesKernel";
import type { BusinessUnit, LineItem } from "./types";

export const CEPL_ID = 1;
const CPL_UNIT_NAME = "Profit & Loss";

export function resolveCplBu(businessUnits: BusinessUnit[]): number {
  return businessUnits.find((u) => u.businessId === CEPL_ID && u.name === CPL_UNIT_NAME)?.id ?? -1;
}

export function resolveCplLi(lineItems: LineItem[]): LineItem[] {
  return lineItems.filter((l) => l.businessId === CEPL_ID);
}

export interface LineItemTotal {
  id: number;
  name: string;
  total: number;
}

export interface CompanyPL {
  hasMonthlyDetail: boolean;
  revenue: Series;
  cogs: Series;
  hrCost: Series;
  operatingCost: Series;
  other: Series;
  grossProfit: Series;
  totalExpenses: Series;
  netPL: Series;
  lineItemBreakdown: {
    revenue: LineItemTotal[];
    cogs: LineItemTotal[];
    hrCost: LineItemTotal[];
    operatingCost: LineItemTotal[];
    other: LineItemTotal[];
  };
}

function sumCategory(idx: FrIndex, buId: number, lineItems: LineItem[], category: LineItem["category"], periodIds: number[]): Series {
  const ids = lineItems.filter((l) => l.category === category).map((l) => l.id);
  return periodIds.map((pid) => {
    const vals = ids.map((lid) => frGet(idx, buId, pid, lid)).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  });
}

// Per-ledger-group totals within a category, for the P&L line-item
// drill-down - same filter as sumCategory, but keeps each item separate
// instead of collapsing them into one number.
function categoryBreakdown(idx: FrIndex, buId: number, lineItems: LineItem[], category: LineItem["category"], periodIds: number[]): LineItemTotal[] {
  return lineItems
    .filter((l) => l.category === category)
    .map((l) => ({ id: l.id, name: l.name, total: sum(series(idx, buId, l.id, periodIds)) }))
    .filter((l) => l.total !== 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export function computeCompanyPL(idx: FrIndex, buId: number, lineItems: LineItem[], periodIds: number[]): CompanyPL {
  const revenue = sumCategory(idx, buId, lineItems, "revenue", periodIds);
  const cogs = sumCategory(idx, buId, lineItems, "cogs", periodIds);
  const hrCost = sumCategory(idx, buId, lineItems, "hr_cost", periodIds);
  const operatingCost = sumCategory(idx, buId, lineItems, "operating_cost", periodIds);
  const other = sumCategory(idx, buId, lineItems, "other", periodIds);

  const grossProfit = revenue.map((rv, i) => (rv == null ? null : rv + (cogs[i] ?? 0)));
  const totalExpenses = periodIds.map((_, i) => {
    const parts = [cogs[i], hrCost[i], operatingCost[i]].filter((v): v is number => v != null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  });
  const netPL = periodIds.map((_, i) => {
    if (revenue[i] == null && totalExpenses[i] == null && other[i] == null) return null;
    return (revenue[i] ?? 0) + (totalExpenses[i] ?? 0) + (other[i] ?? 0);
  });

  return {
    hasMonthlyDetail: revenue.some((v) => v != null),
    revenue,
    cogs,
    hrCost,
    operatingCost,
    other,
    grossProfit,
    totalExpenses,
    netPL,
    lineItemBreakdown: {
      revenue: categoryBreakdown(idx, buId, lineItems, "revenue", periodIds),
      cogs: categoryBreakdown(idx, buId, lineItems, "cogs", periodIds),
      hrCost: categoryBreakdown(idx, buId, lineItems, "hr_cost", periodIds),
      operatingCost: categoryBreakdown(idx, buId, lineItems, "operating_cost", periodIds),
      other: categoryBreakdown(idx, buId, lineItems, "other", periodIds),
    },
  };
}

export const CPL_MONTHS = MONTHS;
