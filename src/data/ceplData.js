// ─────────────────────────────────────────────────────────────────────────────
// CEPL P&L workbook adapter: the six departments' FY 2025-26 monthly P&L
// (F&B, Store, Trading Items, Pottery, Batik, Stitching) plus the multi-year
// F&B/Store history from the workbook's Overview sheet.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS, FY2526_PIDS, frGet, monthPeriodIds, series, pctSeries, sum } from "./core";

export const FNB_BU = 1;   // CEPL > F&B department
export const STORE_BU = 2; // CEPL > Store department

// lineItemId map (verified against extracted_data.json)
const LI = {
  productSales: 1, retailBarSales: 2, eventCatering: 3, totalRevenue: 4,
  rawMaterial: 5, cogsPct: 9, hrCost: 12, hrPct: 15, siteCost: 16,
  marketingCost: 20, deliveryComm: 22, totalExpense: 33, profitLoss: 34, plPct: 35,
  storeTotalSales: 36, storeRawMaterial: 38, storeTradingItems: 39, storeDirectExpenses: 40,
  storeTotalExpense: 61, storeProfitLoss: 62,
};

// ── F&B (Siena restaurant) monthly P&L — FY 2025-26, fully real ─────────────
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

// ── Store (Sienna retail, CEPL P&L sheet) monthly — FY 2025-26, fully real ─
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

// ── CEPL Group Overview — FY 2025-26 monthly detail ────────────────────────
export const OVERVIEW = {
  fy2526: {
    fb: {
      sales:   FAB.totalRevenue,
      expense: FAB.totalExpense,
      pl:      FAB.profitLoss,
      plPct:   FAB.plPct,
    },
    store: {
      sales:   STORE.totalSales,
      expense: STORE.totalExpense,
      pl:      STORE.profitLoss,
      plPct:   STORE.plPct,
    },
    totals: {
      fbSales: sum(FAB.totalRevenue), storeSales: sum(STORE.totalSales),
      fbPL: sum(FAB.profitLoss), storePL: sum(STORE.profitLoss),
    },
  },
};

// ── Craft departments (Trading Items, Pottery, Batik, Stitching) ───────────
// These four departments live inside the same CEPL P&L workbook as F&B/Store
// and have full FY 2025-26 monthly detail (financialRecords), but the sheet
// layout differs department-to-department (each has its own mix of raw-material
// / consumable / sub-category line items). Rather than summing every row tagged
// `category: "cogs"|"hr_cost"|"operating_cost"` — which double-counts, since the
// sheets mix true totals with overlapping sub-breakdowns (see
// raw._meta.knownSimplifications on category tagging) — the figures below use
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
// EBITDA figure isn't derivable — Net Profit & Loss (post all expenses) and
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

function deptFinancials(deptKey, periodIds) {
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
function overviewYear(unitId, fiscalYear) {
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
    label: `FY ${fy.slice(2, 4)}-${fy.slice(7)}`,
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
