// Pure, parametrized Store department cost-structure computation (CEPL P&L
// sheet, department "Store"). Ids resolved by name from live reference data
// - see the header note in fabData.ts for why.
import { series, pctSeries, type FrIndex, type Series } from "./seriesKernel";
import type { BusinessUnit, LineItem } from "./types";

export const CEPL_ID = 1;
const STORE_BU_NAME = "Store";

export function resolveStoreBu(businessUnits: BusinessUnit[]): number {
  return businessUnits.find((u) => u.businessId === CEPL_ID && u.name === STORE_BU_NAME)?.id ?? -1;
}

const LI_NAMES = {
  storeTotalSales: "Retails Sales Report",
  storeRawMaterial: "Raw Materials Purchase",
  storeTradingItems: "Trading Items Purchase",
  storeDirectExpenses: "Direct Expenses",
  hrCost: "HR Cost",
  siteCost: "Site Cost (IT, POS, Utilities, Internet, Phones, Electiricity & Similar Costs)",
  storeTotalExpense: "Total Expenses",
  storeProfitLoss: "Net Profit & Loss",
  plPct: "Profit & Loss %",
} as const;

export type StoreLi = Record<keyof typeof LI_NAMES, number | null>;

export function resolveStoreLi(lineItems: LineItem[]): StoreLi {
  const byName = new Map(lineItems.filter((l) => l.businessId === CEPL_ID).map((l) => [l.name, l.id]));
  const out = {} as StoreLi;
  for (const key of Object.keys(LI_NAMES) as (keyof typeof LI_NAMES)[]) {
    out[key] = byName.get(LI_NAMES[key]) ?? null;
  }
  return out;
}

export interface StoreDeptYearData {
  fy: string;
  label: string;
  hasMonthlyDetail: boolean;
  totalSales: Series; rawMaterial: Series; tradingItems: Series; directExpenses: Series;
  hrCost: Series; siteCost: Series; totalExpense: Series; profitLoss: Series; plPct: Series;
}

export function computeStoreYear(
  idx: FrIndex, bu: number, li: StoreLi, fy: string, label: string, periodIds: number[]
): StoreDeptYearData {
  const totalSales = series(idx, bu, li.storeTotalSales, periodIds);
  return {
    fy, label, hasMonthlyDetail: totalSales.some((v) => v != null),
    totalSales,
    rawMaterial: series(idx, bu, li.storeRawMaterial, periodIds),
    tradingItems: series(idx, bu, li.storeTradingItems, periodIds),
    directExpenses: series(idx, bu, li.storeDirectExpenses, periodIds),
    hrCost: series(idx, bu, li.hrCost, periodIds),
    siteCost: series(idx, bu, li.siteCost, periodIds),
    totalExpense: series(idx, bu, li.storeTotalExpense, periodIds),
    profitLoss: series(idx, bu, li.storeProfitLoss, periodIds),
    plPct: pctSeries(idx, bu, li.plPct, periodIds),
  };
}
