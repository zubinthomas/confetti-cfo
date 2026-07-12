// ─────────────────────────────────────────────────────────────────────────────
// Financial data derived LIVE from ./extracted_data.json, which was extracted
// from the underlying Excel workbooks:
//   • CEPL_P___L_2025-26.xlsx                    (F&B + Store departments, CEPL)
//   • Cafe_Weekly_P_L_-_2025_-2026.xlsx           (Cafe outlet weekly detail)
//   • Sienna_Store_Sales_Analysis_FINAL.xlsx      (Sienna channel + category sales)
//
// Nothing below is hand-entered — every number is computed from the raw
// businesses / businessUnits / periods / lineItems / financialRecords /
// categories / channels / salesRecords tables in extracted_data.json.
//
// Data coverage (after the 2026-07 extraction fix pass — see raw._meta.fixPass):
//   - Line-item monthly P&L exists for all six CEPL departments for FY 2025-26.
//     Historical F&B/Store annual P&L (FY 2021-22 … 2024-25) comes from the
//     workbook's Overview sheet (lineItems 191-194, monthly Sales/Expense/P&L).
//   - Sienna channel-level ("Overall sales") totals exist for all six fiscal
//     years FY 2021-22 … FY 2026-27 (the last has Apr-May only so far).
//   - Category-level detail is complete (12 months) for FY 2021-22 … 2025-26,
//     so the category mix uses the current year FY 2025-26.
//   - The Cafe workbook provides weekly outlet-level detail (Bosar Ghor /
//     Dinning Room / Rannaghor) from Sept 2025, and whole-cafe weekly+monthly
//     P&L for Apr-Aug 2025. "Durga Puja 2025" is a summary of the two calendar
//     weeks it spans (verified: totals match exactly) and is therefore kept
//     out of weekly aggregations.
// Known source-workbook quirks (not extraction errors):
//   - Store sheet June FY25-26 "Net Profit & Loss" is -242,989 but its own
//     Sales - Expenses is -334,014 (the Overview sheet shows the latter).
//     The Store sheet's own reported bottom line is used here.
//   - The FY22-23 "Overall sales" grand-total cell is 2,900 above the sum of
//     its monthly channel cells; the monthly detail is used here.
// ─────────────────────────────────────────────────────────────────────────────

import raw from "./extracted_data.json";

const { periods, financialRecords, categories, channels, salesRecords, lineItems, businessUnits, vendors, consignmentRecords } = raw;

// ── Generic lookups over the normalized tables ──────────────────────────────
const frMap = {};
for (const r of financialRecords) {
  (frMap[r.businessUnitId] ??= {});
  (frMap[r.businessUnitId][r.periodId] ??= {});
  frMap[r.businessUnitId][r.periodId][r.lineItemId] = r.value;
}
const frGet = (businessUnitId, periodId, lineItemId) =>
  frMap[businessUnitId]?.[periodId]?.[lineItemId] ?? null;

const monthPeriodIds = (fiscalYear) =>
  periods
    .filter((p) => p.periodType === "month" && p.fiscalYear === fiscalYear)
    .sort((a, b) => a.id - b.id)
    .map((p) => p.id);

function series(businessUnitId, lineItemId, periodIds) {
  return periodIds.map((pid) => frGet(businessUnitId, pid, lineItemId));
}
// financialRecords stores percentages as fractions (0.296 = 29.6%)
function pctSeries(businessUnitId, lineItemId, periodIds) {
  return series(businessUnitId, lineItemId, periodIds).map((v) =>
    v == null ? null : Math.round(v * 1000) / 10
  );
}
const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

export const MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];

const FNB_BU = 1;   // CEPL > F&B department
const STORE_BU = 2; // CEPL > Store department
const FY2526_PIDS = monthPeriodIds("2025-2026");

// lineItemId map (verified against extracted_data.json — see business logic notes above)
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

// ── CEPL Group Overview — FY 2025-26 (only year with full F&B+Store P&L) ───
// Historical-year (FY24-25, FY23-24…) F&B/Store P&L is NOT present in the
// extracted dataset, so it's intentionally omitted rather than fabricated.
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

// ── Sienna Store — channel breakdown (real, "Overall sales" sheet) ─────────
const CHANNEL_NAME_MAP = { "Corporate Sales": "Corporate", "Online Sales": "Online" };

function channelBreakdown(periodIds) {
  const out = {};
  for (const c of channels) {
    const name = CHANNEL_NAME_MAP[c.name] || c.name;
    out[name] = periodIds.map((pid) => {
      const rec = salesRecords.find(
        (r) => r.periodId === pid && r.channelId === c.id && r.categoryId == null
      );
      return rec ? rec.amount : 0;
    });
  }
  const channelNames = Object.keys(out);
  out.Total = periodIds.map((_, i) => sum(channelNames.map((name) => out[name][i])));
  return out;
}
function channelTotals(breakdown) {
  const totals = {};
  for (const [name, vals] of Object.entries(breakdown)) totals[name] = sum(vals);
  return totals;
}

const FY2627_PIDS = periods
  .filter((p) => p.periodType === "month" && p.fiscalYear === "2026-2027" && p.id <= 58)
  .sort((a, b) => a.id - b.id)
  .map((p) => p.id); // only Apr & May 2026 currently in the source data

const fy2526Channels = channelBreakdown(FY2526_PIDS);
const fy2627Channels = channelBreakdown(FY2627_PIDS);

export const SIENNA_STORE = {
  fy2526: { months: MONTHS, channels: fy2526Channels, totals: channelTotals(fy2526Channels) },
  fy2627: { months: ["Apr", "May"], channels: fy2627Channels, totals: channelTotals(fy2627Channels) },
};

// ── Sienna Store — annual category totals ──────────────────────────────────
// Category detail is complete for FY 2021-22 … FY 2025-26 (12 months each),
// so the headline mix uses the current year and a per-year breakdown is
// exported for comparisons.
const CATEGORY_NAME_MAP = { "Leather & jute": "Leather & Jute" };

function categoriesForFY(fiscalYear) {
  const pids = monthPeriodIds(fiscalYear);
  return categories
    .map((cat) => ({
      name: CATEGORY_NAME_MAP[cat.name] || cat.name,
      value: sum(
        salesRecords
          .filter((r) => r.categoryId === cat.id && pids.includes(r.periodId))
          .map((r) => r.amount)
      ),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

export const SIENNA_CATEGORIES_LABEL = "FY 2025-26";
export const SIENNA_CATEGORIES = categoriesForFY("2025-2026");
export const SIENNA_CATEGORIES_BY_FY = Object.fromEntries(
  ["2021-2022", "2022-2023", "2023-2024", "2024-2025", "2025-2026"].map((fy) => [
    fy,
    categoriesForFY(fy),
  ])
);

// ── Store revenue — multi-year history ─────────────────────────────────────
// Every fiscal year now has a channel-level "Overall sales" block in the
// source, so all totals are summed from monthly channel records.
function fyStoreRevenue(fiscalYear) {
  const pids = monthPeriodIds(fiscalYear);
  const total = sum(
    salesRecords.filter((r) => pids.includes(r.periodId) && r.categoryId == null).map((r) => r.amount)
  );
  return { total, method: "channel" };
}

export const STORE_HISTORY = [
  { fy: "2021-2022", label: "FY 21-22", ...fyStoreRevenue("2021-2022") },
  { fy: "2022-2023", label: "FY 22-23", ...fyStoreRevenue("2022-2023") },
  { fy: "2023-2024", label: "FY 23-24", ...fyStoreRevenue("2023-2024") },
  { fy: "2024-2025", label: "FY 24-25", ...fyStoreRevenue("2024-2025") },
  { fy: "2025-2026", label: "FY 25-26", ...fyStoreRevenue("2025-2026") },
  { fy: "2026-2027", label: "FY 26-27 (Apr–May)", ...fyStoreRevenue("2026-2027") },
];

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
const DEPT_BU = { tradingItems: 3, pottery: 4, batik: 5, stitching: 6 };
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

// ── F&B outlets & revenue streams (Cafe workbook, business 2) ──────────────
// Apr-Aug 2025: one whole-cafe weekly/monthly P&L (unit "Cafe").
// Sept 2025 onward: weekly P&L split by outlet — Bosar Ghor (café section),
// Dinning Room (restaurant) and Rannaghor (events kitchen) — plus a Total
// column. Revenue is also sectioned into streams: Inhouse Product Sales,
// Sales from Liquor (bar), Sales from Events and Sales from Outside Products.
const li2ByName = {};
for (const l of lineItems) {
  if (l.businessId === 2) (li2ByName[l.name] ??= {})[l.valueType] = l.id;
}
const li2 = (name) => li2ByName[name]?.amount ?? null;

export const OUTLET_UNITS = { bosarGhor: 8, dinningRoom: 9, rannaghor: 10, total: 11 };
export const OUTLET_LABELS = {
  bosarGhor: "Bosar Ghor (Cafe)",
  dinningRoom: "Dinning Room (Restaurant)",
  rannaghor: "Rannaghor",
  total: "All outlets",
};

// ordered outlet weeks (Sept 2025 →), special-event summaries excluded
export const OUTLET_WEEKS = periods
  .filter((p) => p.periodType === "week" && p.startDate >= "2025-09-01" && !p.isSpecialEvent)
  .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
  .map((p) => ({
    id: p.id,
    label: p.label,
    short: p.startDate.slice(8, 10) + "/" + p.startDate.slice(5, 7),
    month: new Date(p.startDate + "T00:00:00").toLocaleString("en", { month: "short" }),
  }));

const OUTLET_STREAM_LIS = {
  totalSales: li2("Total Cafe Sales"),
  inhouse:    li2("Inhouse Product Sales"),
  liquor:     li2("Sales from Liquor"),
  events:     li2("Sales from Events"),
  outside:    li2("Sales from Outside Products"),
  opCost:     li2("Total Operation Cost"),
  pl:         li2("P+L = Gross Revenue - Operating Costs"),
};

function outletSeries(unitId) {
  const out = {};
  for (const [key, lid] of Object.entries(OUTLET_STREAM_LIS)) {
    out[key] = OUTLET_WEEKS.map((w) => frGet(unitId, w.id, lid));
  }
  return out;
}
export const OUTLETS = Object.fromEntries(
  Object.entries(OUTLET_UNITS).map(([key, uid]) => [key, outletSeries(uid)])
);

// Durga Puja 2025 special-event summary (sum of the two weeks it spans; kept
// separate so weekly series don't double count)
const DURGA_PID = periods.find((p) => p.isSpecialEvent)?.id;
export const DURGA_PUJA = {
  label: "Durga Puja 2025 (22 Sep – 5 Oct)",
  totalSales: frGet(OUTLET_UNITS.total, DURGA_PID, OUTLET_STREAM_LIS.totalSales),
  pl:         frGet(OUTLET_UNITS.total, DURGA_PID, OUTLET_STREAM_LIS.pl),
};

// menu mix per outlet — aggregated over all outlet weeks
const MENU_ITEMS = [
  "Pizza", "Omlettes", "Sandwitch & Burgers", "Snacks", "Salads", "Soups",
  "Pastas", "Desserts", "Coffee", "Tea", "Lemonade", "Café Products",
  "Cafe Specials", "Sienna Specials", "Baro Plates", "Chotto Plates",
  "Sharing Portions", "Specials", "Bar Bites", "Mixer", "Misti",
];
const MENU_LABELS = { "Sandwitch & Burgers": "Sandwiches & Burgers", "Omlettes": "Omelettes" };
export function menuMix(outletKey) {
  const uid = OUTLET_UNITS[outletKey];
  return MENU_ITEMS.map((name) => ({
    name: MENU_LABELS[name] || name,
    value: sum(OUTLET_WEEKS.map((w) => frGet(uid, w.id, li2(name)))),
  }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

// liquor mix (all outlets) — "Beer" and "Wine/Beer" are the same row renamed
export const LIQUOR_MIX = [
  { name: "Cocktails", lis: ["Cocktails"] },
  { name: "Spirits", lis: ["Spirits"] },
  { name: "Wine & Beer", lis: ["Beer", "Wine/Beer"] },
].map(({ name, lis }) => ({
  name,
  value: sum(lis.flatMap((n) => OUTLET_WEEKS.map((w) => frGet(OUTLET_UNITS.total, w.id, li2(n))))),
})).filter((x) => x.value > 0);

// events detail — weekly totals plus named-event breakdown (all outlets)
const EVENT_SUB_LIS = [
  "Rannaghor", "Other Events", "Other Events (After Hours)", "Other Events (Mizu)",
  "Other Events (Beyond Berg)", "Other Events (Dali Gala After Hours)",
  "Other Events (Riga Foods and Key Stone)",
];
export const EVENTS_BREAKDOWN = EVENT_SUB_LIS.map((name) => ({
  name: name === "Rannaghor" ? "Rannaghor (event kitchen)" : name.replace(/^Other Events \(?|\)$/g, "") || "Other Events",
  value: sum(OUTLET_WEEKS.map((w) => frGet(OUTLET_UNITS.total, w.id, li2(name)))),
})).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);

// Whole-cafe P&L, Apr-Aug 2025 (unit "Cafe": monthly Total column of the
// weekly sheets; the outlet split doesn't exist yet for these months)
const CAFE_BU = 7;
export const CAFE_MONTH_LABELS = ["Apr", "May", "Jun", "Jul", "Aug"];
const CAFE_MONTH_PIDS = FY2526_PIDS.slice(0, 5);
export const CAFE_MONTHLY = {
  productSales: series(CAFE_BU, li2("Café Product Sales"), CAFE_MONTH_PIDS),
  retailSales:  series(CAFE_BU, li2("Café Retail Sales"), CAFE_MONTH_PIDS),
  liquor:       series(CAFE_BU, li2("Liquor"), CAFE_MONTH_PIDS),
  eventSales:   series(CAFE_BU, li2("Cafe Event Sales"), CAFE_MONTH_PIDS),
  totalSales:   series(CAFE_BU, li2("Total Cafe Sales"), CAFE_MONTH_PIDS),
  opCost:       series(CAFE_BU, li2("Total Operation Cost"), CAFE_MONTH_PIDS),
  pl:           series(CAFE_BU, li2("P+L = Gross Revenue - Operating Costs"), CAFE_MONTH_PIDS),
};

// ── Consignment & partner brands (Sienna workbook) ─────────────────────────
export const CONSIGNMENT_FYS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];
export const CONSIGNMENT = CONSIGNMENT_FYS.map((fy) => {
  const pids = monthPeriodIds(fy);
  const rows = vendors
    .map((v) => ({
      name: v.name,
      group: v.group,
      rate: v.commissionRate,
      total: sum(
        consignmentRecords
          .filter((r) => r.vendorId === v.id && pids.includes(r.periodId))
          .map((r) => r.amount)
      ),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  return {
    fy,
    label: `FY ${fy.slice(2, 4)}-${fy.slice(7)}`,
    vendors: rows,
    total: sum(rows.map((r) => r.total)),
    commission: sum(rows.map((r) => r.total * (r.rate || 0))),
  };
});

// ── Convenience: format helpers ──────────────────────────────────────────────
export const L = (n) => {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n/10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${(n/100000).toFixed(1)}L`;
  if (abs >= 1000)     return `${(n/1000).toFixed(1)}K`;
  return String(Math.round(n));
};

export const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
