// ─────────────────────────────────────────────────────────────────────────────
// CEPL P&L workbook adapter: the six departments' FY 2025-26 monthly P&L
// (F&B, Store, Trading Items, Pottery, Batik, Stitching) plus the multi-year
// F&B/Store history from the workbook's Overview sheet.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS, FY2526_PIDS, frGet, monthPeriodIds, series, pctSeries, sum, fyLabel, periods, type Series } from "./core";

export const FNB_BU = 1;   // CEPL > F&B department
export const STORE_BU = 2; // CEPL > Store department

// lineItemId map (verified against the extracted dataset)
const LI = {
  productSales: 1, retailBarSales: 2, eventCatering: 3, totalRevenue: 4,
  rawMaterial: 5, cogsPct: 9, hrCost: 12, hrPct: 15, siteCost: 16,
  marketingCost: 20, deliveryComm: 22, totalExpense: 33, profitLoss: 34, plPct: 35,
  storeTotalSales: 36, storeRawMaterial: 38, storeTradingItems: 39, storeDirectExpenses: 40,
  storeTotalExpense: 61, storeProfitLoss: 62,
};

// ── F&B (Siena restaurant) monthly P&L - FY 2025-26, fully real ─────────────
export const FAB = {
  months: MONTHS,
  productSales:   series(FNB_BU, LI.productSales, FY2526_PIDS),
  retailBarSales: series(FNB_BU, LI.retailBarSales, FY2526_PIDS),
  eventCatering:  series(FNB_BU, LI.eventCatering, FY2526_PIDS),
  totalRevenue:   series(FNB_BU, LI.totalRevenue, FY2526_PIDS),
  rawMaterial:    series(FNB_BU, LI.rawMaterial, FY2526_PIDS),
  cogsPct:        pctSeries(FNB_BU, LI.cogsPct, FY2526_PIDS),
  hrCost:         series(FNB_BU, LI.hrCost, FY2526_PIDS),
  hrPct:          pctSeries(FNB_BU, LI.hrPct, FY2526_PIDS),
  siteCost:       series(FNB_BU, LI.siteCost, FY2526_PIDS),
  marketingCost:  series(FNB_BU, LI.marketingCost, FY2526_PIDS),
  deliveryComm:   series(FNB_BU, LI.deliveryComm, FY2526_PIDS),
  totalExpense:   series(FNB_BU, LI.totalExpense, FY2526_PIDS),
  profitLoss:     series(FNB_BU, LI.profitLoss, FY2526_PIDS),
  plPct:          pctSeries(FNB_BU, LI.plPct, FY2526_PIDS),
};

// ── Store (Sienna retail, CEPL P&L sheet) monthly - FY 2025-26, fully real ─
export const STORE = {
  months: MONTHS,
  totalSales:     series(STORE_BU, LI.storeTotalSales, FY2526_PIDS),
  rawMaterial:    series(STORE_BU, LI.storeRawMaterial, FY2526_PIDS),
  tradingItems:   series(STORE_BU, LI.storeTradingItems, FY2526_PIDS),
  directExpenses: series(STORE_BU, LI.storeDirectExpenses, FY2526_PIDS),
  hrCost:         series(STORE_BU, LI.hrCost, FY2526_PIDS),
  siteCost:       series(STORE_BU, LI.siteCost, FY2526_PIDS),
  totalExpense:   series(STORE_BU, LI.storeTotalExpense, FY2526_PIDS),
  profitLoss:     series(STORE_BU, LI.storeProfitLoss, FY2526_PIDS),
  plPct:          pctSeries(STORE_BU, LI.plPct, FY2526_PIDS),
};

// ── Craft departments (Trading Items, Pottery, Batik, Stitching) ───────────
// These four departments live inside the same CEPL P&L workbook as F&B/Store
// and have full FY 2025-26 monthly detail (financialRecords), but the sheet
// layout differs department-to-department (each has its own mix of raw-material
// / consumable / sub-category line items). Rather than summing every row tagged
// `category: "cogs"|"hr_cost"|"operating_cost"` - which double-counts, since the
// sheets mix true totals with overlapping sub-breakdowns (see
// raw._meta.knownSimplifications on category tagging) - the figures below use
// only the line items that are the workbook's own reported totals:
//   • Total Sales            (lineItemId 85)  → revenue
//   • primary purchase cost  (Raw Materials / Trading Items Purchase)  → COGS
//   • Total Expenses         (lineItemId 61)  → totalExpenses
//   • Net Profit & Loss      (lineItemId 62)  → netPL
// This was verified against the raw data: revenue − totalExpenses === netPL
// and revenue − cogs (gross profit) ≥ netPL for every month in every one of
// these four departments, so nothing here is fabricated or estimated.
//
// There isn't a depreciation/interest split in the source data, so a true
// EBITDA figure isn't derivable - Net Profit & Loss (post all expenses) and
// Net Margin are shown instead of an invented EBITDA number.
export const DEPT_BU = { tradingItems: 3, pottery: 4, batik: 5, stitching: 6 };
const DEPT_COGS_LINE_IDS = {
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
  revenue: Series;
  cogs: Series;
  grossProfit: Series;
  grossMarginPct: Series;
  totalExpenses: Series;
  opexOther: Series;
  netPL: Series;
  netMarginPct: Series;
}

type DeptKey = keyof typeof DEPT_BU;

function deptFinancials(deptKey: DeptKey, periodIds: number[]): DeptFinancials {
  const buId = DEPT_BU[deptKey];
  const cogsIds = DEPT_COGS_LINE_IDS[deptKey];
  const revenue = series(buId, DEPT_TOTAL_SALES_LI, periodIds);
  const cogs = periodIds.map((pid) => {
    const vals = cogsIds.map((lid) => frGet(buId, pid, lid));
    if (vals.every((v) => v == null)) return null;
    return sum(vals);
  });
  const totalExpenses = series(buId, DEPT_TOTAL_EXPENSES_LI, periodIds);
  const netPL = series(buId, DEPT_NET_PL_LI, periodIds);
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

export const TRADING_ITEMS = deptFinancials("tradingItems", FY2526_PIDS);
export const POTTERY = deptFinancials("pottery", FY2526_PIDS);
export const BATIK = deptFinancials("batik", FY2526_PIDS);
export const STITCHING = deptFinancials("stitching", FY2526_PIDS);

// ── F&B / Store annual history (Overview sheet + FY25-26 dept sheets) ──────
// The Overview sheet's historical blocks are stored as lineItems 191 (Sales),
// 192 (Expense), 193 (Profit & Loss) per month for units F&B (1) and Store (2).
const OV_LI = { sales: 191, expense: 192, pl: 193 };
function overviewYear(unitId: number, fiscalYear: string) {
  const pids = monthPeriodIds(fiscalYear);
  return {
    sales:   sum(series(unitId, OV_LI.sales, pids)),
    expense: sum(series(unitId, OV_LI.expense, pids)),
    pl:      sum(series(unitId, OV_LI.pl, pids)),
  };
}
export const FNB_STORE_HISTORY = [
  ...["2021-2022", "2022-2023", "2023-2024", "2024-2025"].map((fy) => ({
    fy,
    label: fyLabel(fy),
    fb: overviewYear(FNB_BU, fy),
    store: overviewYear(STORE_BU, fy),
  })),
  {
    fy: "2025-2026",
    label: "FY 25-26",
    fb:    { sales: sum(FAB.totalRevenue), expense: sum(FAB.totalExpense), pl: sum(FAB.profitLoss) },
    store: { sales: sum(STORE.totalSales), expense: sum(STORE.totalExpense), pl: sum(STORE.profitLoss) },
  },
];

// ── CEPL Group Overview - per fiscal year, data-driven ──────────────────────
// Full department-level monthly detail (financialRecords) only exists for
// FY 2025-26 so far; other years only have the Overview sheet's annual
// Sales/Expense/P&L totals (see overviewYear() above). This queries by
// period ids for whichever year is asked for rather than assuming FY25-26,
// so importing a real CEPL P&L workbook for another year makes full monthly
// detail appear for it automatically, with no code change here.
export interface OverviewYearData {
  fy: string;
  label: string;
  hasMonthlyDetail: boolean;
  fb: { sales: Series; expense: Series; pl: Series; plPct: Series };
  store: { sales: Series; expense: Series; pl: Series; plPct: Series };
  totals: { fbSales: number; storeSales: number; fbPL: number; storePL: number };
}

function overviewForFY(fiscalYear: string): OverviewYearData {
  const pids = monthPeriodIds(fiscalYear);
  const fbSales = series(FNB_BU, LI.totalRevenue, pids);
  const hasMonthlyDetail = fbSales.some((v) => v != null);

  if (hasMonthlyDetail) {
    const fb = {
      sales: fbSales,
      expense: series(FNB_BU, LI.totalExpense, pids),
      pl: series(FNB_BU, LI.profitLoss, pids),
      plPct: pctSeries(FNB_BU, LI.plPct, pids),
    };
    const store = {
      sales: series(STORE_BU, LI.storeTotalSales, pids),
      expense: series(STORE_BU, LI.storeTotalExpense, pids),
      pl: series(STORE_BU, LI.storeProfitLoss, pids),
      plPct: pctSeries(STORE_BU, LI.plPct, pids),
    };
    return {
      fy: fiscalYear, label: fyLabel(fiscalYear), hasMonthlyDetail: true, fb, store,
      totals: {
        fbSales: sum(fb.sales), storeSales: sum(store.sales),
        fbPL: sum(fb.pl), storePL: sum(store.pl),
      },
    };
  }

  const fbAnnual = overviewYear(FNB_BU, fiscalYear);
  const storeAnnual = overviewYear(STORE_BU, fiscalYear);
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

const CANDIDATE_FYS = [...new Set(
  periods.filter((p) => p.periodType === "month").map((p) => p.fiscalYear)
)].sort();

export const OVERVIEW_BY_FY: Record<string, OverviewYearData> = Object.fromEntries(
  CANDIDATE_FYS.map((fy) => [fy, overviewForFY(fy)])
);

// Years with any real F&B/Store revenue at all (monthly or annual) - keeps a
// future fiscal year with no CEPL data yet (neither department sheets nor
// the Overview sheet) from showing up as an empty, pointless chip.
export const OVERVIEW_FYS = CANDIDATE_FYS.filter((fy) => {
  const t = OVERVIEW_BY_FY[fy].totals;
  return t.fbSales !== 0 || t.storeSales !== 0;
});
