// Pure, parametrized Store department cost-structure computation (CEPL P&L
// sheet, business unit 2).
import { series, pctSeries, type FrIndex, type Series } from "./seriesKernel";

export const STORE_BU = 2;

const LI = {
  storeTotalSales: 36, storeRawMaterial: 38, storeTradingItems: 39, storeDirectExpenses: 40,
  hrCost: 12, siteCost: 16, storeTotalExpense: 61, storeProfitLoss: 62, plPct: 35,
};

export interface StoreDeptYearData {
  fy: string;
  label: string;
  hasMonthlyDetail: boolean;
  totalSales: Series; rawMaterial: Series; tradingItems: Series; directExpenses: Series;
  hrCost: Series; siteCost: Series; totalExpense: Series; profitLoss: Series; plPct: Series;
}

export function computeStoreYear(idx: FrIndex, fy: string, label: string, periodIds: number[]): StoreDeptYearData {
  const totalSales = series(idx, STORE_BU, LI.storeTotalSales, periodIds);
  return {
    fy, label, hasMonthlyDetail: totalSales.some((v) => v != null),
    totalSales,
    rawMaterial: series(idx, STORE_BU, LI.storeRawMaterial, periodIds),
    tradingItems: series(idx, STORE_BU, LI.storeTradingItems, periodIds),
    directExpenses: series(idx, STORE_BU, LI.storeDirectExpenses, periodIds),
    hrCost: series(idx, STORE_BU, LI.hrCost, periodIds),
    siteCost: series(idx, STORE_BU, LI.siteCost, periodIds),
    totalExpense: series(idx, STORE_BU, LI.storeTotalExpense, periodIds),
    profitLoss: series(idx, STORE_BU, LI.storeProfitLoss, periodIds),
    plPct: pctSeries(idx, STORE_BU, LI.plPct, periodIds),
  };
}
