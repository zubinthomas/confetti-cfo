// Pure, parametrized F&B (CEPL business unit 1) monthly P&L computation.
import { MONTHS, series, pctSeries, sum, type FrIndex, type Series } from "./seriesKernel";

export const FNB_BU = 1;

const LI = {
  productSales: 1, retailBarSales: 2, eventCatering: 3, totalRevenue: 4,
  rawMaterial: 5, cogsPct: 9, hrCost: 12, hrPct: 15, siteCost: 16,
  marketingCost: 20, deliveryComm: 22, totalExpense: 33, profitLoss: 34, plPct: 35,
};

export interface FabMonthly {
  months: string[];
  productSales: Series; retailBarSales: Series; eventCatering: Series; totalRevenue: Series;
  rawMaterial: Series; cogsPct: Series; hrCost: Series; hrPct: Series; siteCost: Series;
  marketingCost: Series; deliveryComm: Series; totalExpense: Series; profitLoss: Series; plPct: Series;
}

export function computeFabMonthly(idx: FrIndex, periodIds: number[]): FabMonthly {
  return {
    months: MONTHS,
    productSales:   series(idx, FNB_BU, LI.productSales, periodIds),
    retailBarSales: series(idx, FNB_BU, LI.retailBarSales, periodIds),
    eventCatering:  series(idx, FNB_BU, LI.eventCatering, periodIds),
    totalRevenue:   series(idx, FNB_BU, LI.totalRevenue, periodIds),
    rawMaterial:    series(idx, FNB_BU, LI.rawMaterial, periodIds),
    cogsPct:        pctSeries(idx, FNB_BU, LI.cogsPct, periodIds),
    hrCost:         series(idx, FNB_BU, LI.hrCost, periodIds),
    hrPct:          pctSeries(idx, FNB_BU, LI.hrPct, periodIds),
    siteCost:       series(idx, FNB_BU, LI.siteCost, periodIds),
    marketingCost:  series(idx, FNB_BU, LI.marketingCost, periodIds),
    deliveryComm:   series(idx, FNB_BU, LI.deliveryComm, periodIds),
    totalExpense:   series(idx, FNB_BU, LI.totalExpense, periodIds),
    profitLoss:     series(idx, FNB_BU, LI.profitLoss, periodIds),
    plPct:          pctSeries(idx, FNB_BU, LI.plPct, periodIds),
  };
}

// F&B has no secondary workbook with multi-year detail to fall back on the
// way Store does - years without department-sheet data only get the two
// Overview-sheet annual totals (lineItems 191 Sales, 193 Profit & Loss for
// business unit 1), nothing else.
const OV_LI = { sales: 191, pl: 193 };

export interface FabYearData {
  fy: string;
  label: string;
  hasMonthlyDetail: boolean;
  productSales: Series; retailBarSales: Series; eventCatering: Series; totalRevenue: Series;
  rawMaterial: Series; cogsPct: Series; hrCost: Series; hrPct: Series; siteCost: Series;
  marketingCost: Series; deliveryComm: Series; totalExpense: Series; profitLoss: Series; plPct: Series;
  totals: { revenue: number; pl: number };
}

export function computeFabYear(idx: FrIndex, fy: string, label: string, periodIds: number[]): FabYearData {
  const m = computeFabMonthly(idx, periodIds);
  const hasMonthlyDetail = m.totalRevenue.some((v) => v != null);
  const totals = hasMonthlyDetail
    ? { revenue: sum(m.totalRevenue), pl: sum(m.profitLoss) }
    : {
        revenue: sum(series(idx, FNB_BU, OV_LI.sales, periodIds)),
        pl: sum(series(idx, FNB_BU, OV_LI.pl, periodIds)),
      };
  return {
    fy, label, hasMonthlyDetail,
    productSales: m.productSales, retailBarSales: m.retailBarSales, eventCatering: m.eventCatering,
    totalRevenue: m.totalRevenue, rawMaterial: m.rawMaterial, cogsPct: m.cogsPct, hrCost: m.hrCost,
    hrPct: m.hrPct, siteCost: m.siteCost, marketingCost: m.marketingCost, deliveryComm: m.deliveryComm,
    totalExpense: m.totalExpense, profitLoss: m.profitLoss, plPct: m.plPct,
    totals,
  };
}
