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
// Known data-coverage gaps (see also raw._meta.knownSimplifications):
//   - Full monthly P&L (financialRecords) only exists for F&B & Store for
//     FY 2025-26 (12 months). No historical-year P&L exists in the extract,
//     so year-over-year P&L/profit comparisons for F&B are not possible yet.
//   - Sienna channel-level ("Overall sales") totals exist for FY 2025-26 (12mo),
//     FY 2026-27 (Apr-May only), and FY 2024-25 (12mo). Older years only have
//     category-level ("Category wise") detail, not a channel breakdown.
//   - Category-level detail is only complete for FY 2022-23 and FY 2023-24
//     (12 months each) plus partial months elsewhere — NOT for FY 2025-26.
//     So the "category mix" chart uses the most recent complete year (FY 2023-24)
//     rather than the current year.
// ─────────────────────────────────────────────────────────────────────────────

import raw from "./extracted_data.json";

const { periods, financialRecords, categories, channels, salesRecords } = raw;

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
// FY 2025-26 only has category-level detail for Apr & May in the source
// workbook, so an "annual" FY25-26 category split isn't derivable yet.
// FY 2023-24 is the most recent year with a complete 12-month category
// breakdown, so that's what's shown; see SIENNA_CATEGORIES_LABEL.
const CATEGORY_NAME_MAP = { "Leather & jute": "Leather & Jute" };
export const SIENNA_CATEGORIES_LABEL = "FY 2023-24";
const FY2324_PIDS = monthPeriodIds("2023-2024");

export const SIENNA_CATEGORIES = categories
  .map((cat) => ({
    name: CATEGORY_NAME_MAP[cat.name] || cat.name,
    value: sum(
      salesRecords
        .filter((r) => r.categoryId === cat.id && FY2324_PIDS.includes(r.periodId))
        .map((r) => r.amount)
    ),
  }))
  .filter((c) => c.value > 0)
  .sort((a, b) => b.value - a.value);

// ── Store revenue — multi-year history (best available method per year) ────
// FY22-23/23-24 only have category-level detail in the source (no channel
// breakdown for those years yet), so their totals are summed from categories;
// other years use the channel-level "Overall sales" total directly.
function fyStoreRevenue(fiscalYear) {
  const pids = monthPeriodIds(fiscalYear);
  const chanTotal = sum(
    salesRecords.filter((r) => pids.includes(r.periodId) && r.categoryId == null).map((r) => r.amount)
  );
  if (chanTotal > 0) return { total: chanTotal, method: "channel" };
  const catTotal = sum(
    salesRecords.filter((r) => pids.includes(r.periodId) && r.categoryId != null).map((r) => r.amount)
  );
  return { total: catTotal, method: "category" };
}

export const STORE_HISTORY = [
  { fy: "2022-2023", label: "FY 22-23", ...fyStoreRevenue("2022-2023") },
  { fy: "2023-2024", label: "FY 23-24", ...fyStoreRevenue("2023-2024") },
  { fy: "2024-2025", label: "FY 24-25", ...fyStoreRevenue("2024-2025") },
  { fy: "2025-2026", label: "FY 25-26", ...fyStoreRevenue("2025-2026") },
  { fy: "2026-2027", label: "FY 26-27 (Apr–May)", ...fyStoreRevenue("2026-2027") },
];

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
