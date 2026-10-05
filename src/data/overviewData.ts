// Pure, parametrized cross-business (F&B + Store) overview computation.
// Ids resolved by name from live reference data - see the header note in
// fabData.ts for why.
import { series, pctSeries, sum, fyLabel, type FrIndex, type Series } from "./seriesKernel";
import { computeFabMonthly, resolveFnbBu, resolveFabLi, CEPL_ID, type FabLi } from "./fabData";
import { computeStoreYear, resolveStoreBu, resolveStoreLi, type StoreLi } from "./storeFinancials";
import type { LineItem } from "./types";

export { resolveFnbBu, resolveStoreBu, resolveFabLi, resolveStoreLi };

// The Overview sheet's historical blocks: Sales/Expense/Profit & Loss per
// month, shared across departments (the businessUnitId param picks F&B vs
// Store's reading of the same line items).
const OV_LI_NAMES = { sales: "Sales (Overview)", expense: "Expense (Overview)", pl: "Profit & Loss (Overview)" } as const;

export type OverviewOvLi = Record<keyof typeof OV_LI_NAMES, number | null>;

export function resolveOverviewOvLi(lineItems: LineItem[]): OverviewOvLi {
  const byName = new Map(lineItems.filter((l) => l.businessId === CEPL_ID).map((l) => [l.name, l.id]));
  const out = {} as OverviewOvLi;
  for (const key of Object.keys(OV_LI_NAMES) as (keyof typeof OV_LI_NAMES)[]) {
    out[key] = byName.get(OV_LI_NAMES[key]) ?? null;
  }
  return out;
}

export function computeOverviewYear(idx: FrIndex, unitId: number, ovLi: OverviewOvLi, periodIds: number[]) {
  return {
    sales: sum(series(idx, unitId, ovLi.sales, periodIds)),
    expense: sum(series(idx, unitId, ovLi.expense, periodIds)),
    pl: sum(series(idx, unitId, ovLi.pl, periodIds)),
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

export function computeOverviewForFY(
  idx: FrIndex, fnbBu: number, storeBu: number, fnbLi: FabLi, storeLi: StoreLi, ovLi: OverviewOvLi,
  fiscalYear: string, periodIds: number[]
): OverviewYearData {
  const fbSales = series(idx, fnbBu, fnbLi.totalRevenue, periodIds);
  const hasMonthlyDetail = fbSales.some((v) => v != null);

  if (hasMonthlyDetail) {
    const fb = {
      sales: fbSales,
      expense: series(idx, fnbBu, fnbLi.totalExpense, periodIds),
      pl: series(idx, fnbBu, fnbLi.profitLoss, periodIds),
      plPct: pctSeries(idx, fnbBu, fnbLi.plPct, periodIds),
    };
    const store = {
      sales: series(idx, storeBu, storeLi.storeTotalSales, periodIds),
      expense: series(idx, storeBu, storeLi.storeTotalExpense, periodIds),
      pl: series(idx, storeBu, storeLi.storeProfitLoss, periodIds),
      plPct: pctSeries(idx, storeBu, storeLi.plPct, periodIds),
    };
    return {
      fy: fiscalYear, label: fyLabel(fiscalYear), hasMonthlyDetail: true, fb, store,
      totals: {
        fbSales: sum(fb.sales), storeSales: sum(store.sales),
        fbPL: sum(fb.pl), storePL: sum(store.pl),
      },
    };
  }

  const fbAnnual = computeOverviewYear(idx, fnbBu, ovLi, periodIds);
  const storeAnnual = computeOverviewYear(idx, storeBu, ovLi, periodIds);
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

export function computeFnbStoreHistory(
  idx: FrIndex, fnbBu: number, storeBu: number, fnbLi: FabLi, storeLi: StoreLi, ovLi: OverviewOvLi,
  periodIdsForFy: (fy: string) => number[]
): FnbStoreHistoryYear[] {
  const priorYears = ["2021-2022", "2022-2023", "2023-2024", "2024-2025"].map((fy) => ({
    fy,
    label: fyLabel(fy),
    fb: computeOverviewYear(idx, fnbBu, ovLi, periodIdsForFy(fy)),
    store: computeOverviewYear(idx, storeBu, ovLi, periodIdsForFy(fy)),
  }));

  const fy2526Pids = periodIdsForFy("2025-2026");
  const fab = computeFabMonthly(idx, fnbBu, fnbLi, fy2526Pids);
  const store = computeStoreYear(idx, storeBu, storeLi, "2025-2026", "FY 25-26", fy2526Pids);

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
