// Pure, parametrized cross-business (F&B + Store) overview computation.
import { series, pctSeries, sum, fyLabel, type FrIndex, type Series } from "./seriesKernel";
import { computeFabMonthly, FNB_BU } from "./fabData";
import { computeStoreYear, STORE_BU } from "./storeFinancials";

export { FNB_BU, STORE_BU };

const LI = {
  totalRevenue: 4, totalExpense: 33, profitLoss: 34, plPct: 35,
  storeTotalSales: 36, storeTotalExpense: 61, storeProfitLoss: 62,
};
// The Overview sheet's historical blocks: lineItems 191 (Sales), 192
// (Expense), 193 (Profit & Loss) per month, for units F&B (1) and Store (2).
const OV_LI = { sales: 191, expense: 192, pl: 193 };

export function computeOverviewYear(idx: FrIndex, unitId: number, periodIds: number[]) {
  return {
    sales: sum(series(idx, unitId, OV_LI.sales, periodIds)),
    expense: sum(series(idx, unitId, OV_LI.expense, periodIds)),
    pl: sum(series(idx, unitId, OV_LI.pl, periodIds)),
  };
}

export interface OverviewYearData {
  fy: string;
  label: string;
  hasMonthlyDetail: boolean;
  fb: { sales: Series; expense: Series; pl: Series; plPct: Series };
  store: { sales: Series; expense: Series; pl: Series; plPct: Series };
  totals: { fbSales: number; storeSales: number; fbPL: number; storePL: number };
}

export function computeOverviewForFY(idx: FrIndex, fiscalYear: string, periodIds: number[]): OverviewYearData {
  const fbSales = series(idx, FNB_BU, LI.totalRevenue, periodIds);
  const hasMonthlyDetail = fbSales.some((v) => v != null);

  if (hasMonthlyDetail) {
    const fb = {
      sales: fbSales,
      expense: series(idx, FNB_BU, LI.totalExpense, periodIds),
      pl: series(idx, FNB_BU, LI.profitLoss, periodIds),
      plPct: pctSeries(idx, FNB_BU, LI.plPct, periodIds),
    };
    const store = {
      sales: series(idx, STORE_BU, LI.storeTotalSales, periodIds),
      expense: series(idx, STORE_BU, LI.storeTotalExpense, periodIds),
      pl: series(idx, STORE_BU, LI.storeProfitLoss, periodIds),
      plPct: pctSeries(idx, STORE_BU, LI.plPct, periodIds),
    };
    return {
      fy: fiscalYear, label: fyLabel(fiscalYear), hasMonthlyDetail: true, fb, store,
      totals: {
        fbSales: sum(fb.sales), storeSales: sum(store.sales),
        fbPL: sum(fb.pl), storePL: sum(store.pl),
      },
    };
  }

  const fbAnnual = computeOverviewYear(idx, FNB_BU, periodIds);
  const storeAnnual = computeOverviewYear(idx, STORE_BU, periodIds);
  return {
    fy: fiscalYear, label: fyLabel(fiscalYear), hasMonthlyDetail: false,
    fb: { sales: [], expense: [], pl: [], plPct: [] },
    store: { sales: [], expense: [], pl: [], plPct: [] },
    totals: {
      fbSales: fbAnnual.sales, storeSales: storeAnnual.sales,
      fbPL: fbAnnual.pl, storePL: storeAnnual.pl,
    },
  };
}

export interface FnbStoreHistoryYear {
  fy: string;
  label: string;
  fb: { sales: number; expense: number; pl: number };
  store: { sales: number; expense: number; pl: number };
}

export function computeFnbStoreHistory(idx: FrIndex, periodIdsForFy: (fy: string) => number[]): FnbStoreHistoryYear[] {
  const priorYears = ["2021-2022", "2022-2023", "2023-2024", "2024-2025"].map((fy) => ({
    fy,
    label: fyLabel(fy),
    fb: computeOverviewYear(idx, FNB_BU, periodIdsForFy(fy)),
    store: computeOverviewYear(idx, STORE_BU, periodIdsForFy(fy)),
  }));

  const fy2526Pids = periodIdsForFy("2025-2026");
  const fab = computeFabMonthly(idx, fy2526Pids);
  const store = computeStoreYear(idx, "2025-2026", "FY 25-26", fy2526Pids);

  return [
    ...priorYears,
    {
      fy: "2025-2026",
      label: "FY 25-26",
      fb: { sales: sum(fab.totalRevenue), expense: sum(fab.totalExpense), pl: sum(fab.profitLoss) },
      store: { sales: sum(store.totalSales), expense: sum(store.totalExpense), pl: sum(store.profitLoss) },
    },
  ];
}
