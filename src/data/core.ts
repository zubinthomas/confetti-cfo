// ─────────────────────────────────────────────────────────────────────────────
// Shared foundation for the data adapters (ceplData / storeData /
// fnbOutletData / cashFlowData / aiContext): raw table access over
// the dataset fetched from /api/dataset (the database-backed copy of the
// verified Excel extraction) plus the lookup and formatting helpers.
//
// Nothing here is hand-entered - every number the adapters derive comes from
// the businesses / businessUnits / periods / lineItems / financialRecords /
// categories / channels / salesRecords / vendors / consignmentRecords tables,
// which were extracted from the source Excel workbooks and verified
// cell-exact against them (see raw._meta.fixPass).
//
// Data coverage:
//   - Line-item monthly P&L exists for all six CEPL departments for FY 2025-26.
//     Historical F&B/Store annual P&L (FY 2021-22 … 2024-25) comes from the
//     workbook's Overview sheet (lineItems 191-194, monthly Sales/Expense/P&L).
//   - Sienna channel-level ("Overall sales") totals exist for all six fiscal
//     years FY 2021-22 … FY 2026-27 (the last has Apr-May only so far).
//   - Category-level detail is complete (12 months) for FY 2021-22 … 2025-26.
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

import { getDataset } from "./datasetStore";

// The dataset model lives in datasetStore.ts (which also holds the data
// fetched from /api/dataset); re-exported here so the adapters keep a single
// import site.
export type {
  Business, BusinessUnit, Period, LineItemCategory, LineItem, FinancialRecord,
  Category, Channel, SalesRecord, Vendor, ConsignmentRecord, Dataset,
} from "./datasetStore";

// Evaluated when the gated dashboard chunk loads - after DatasetGate has
// called setDataset() (see src/App.tsx).
const raw = getDataset();

export const {
  periods, financialRecords, categories, channels, salesRecords,
  lineItems, businessUnits, vendors, consignmentRecords,
} = raw;

// ── Generic lookups over the normalized tables ──────────────────────────────
const frMap: Record<number, Record<number, Record<number, number>>> = {};
for (const r of financialRecords) {
  (frMap[r.businessUnitId] ??= {});
  (frMap[r.businessUnitId][r.periodId] ??= {});
  frMap[r.businessUnitId][r.periodId][r.lineItemId] = r.value;
}
export const frGet = (businessUnitId: number, periodId: number, lineItemId: number | null): number | null =>
  lineItemId == null ? null : frMap[businessUnitId]?.[periodId]?.[lineItemId] ?? null;

export const monthPeriodIds = (fiscalYear: string): number[] =>
  periods
    .filter((p) => p.periodType === "month" && p.fiscalYear === fiscalYear)
    .sort((a, b) => a.id - b.id)
    .map((p) => p.id);

export type Series = (number | null)[];

export function series(businessUnitId: number, lineItemId: number | null, periodIds: number[]): Series {
  return periodIds.map((pid) => frGet(businessUnitId, pid, lineItemId));
}
// financialRecords stores percentages as fractions (0.296 = 29.6%)
export function pctSeries(businessUnitId: number, lineItemId: number, periodIds: number[]): Series {
  return series(businessUnitId, lineItemId, periodIds).map((v) =>
    v == null ? null : Math.round(v * 1000) / 10
  );
}
export const sum = (arr: (number | null | undefined)[]): number =>
  arr.reduce((a: number, b) => a + (b || 0), 0);

export const avg = (arr: (number | null | undefined)[]): number => {
  const valid = arr.filter((v): v is number => v != null);
  return valid.length ? sum(valid) / valid.length : 0;
};

/** Index of the max value in a (possibly null-containing) series, or -1 if all null. */
export const maxIdx = (arr: (number | null | undefined)[]): number =>
  arr.reduce((best: number, v, i) => (v != null && (best === -1 || v > (arr[best] as number)) ? i : best), -1);

/** Index of the min value in a (possibly null-containing) series, or -1 if all null. */
export const minIdx = (arr: (number | null | undefined)[]): number =>
  arr.reduce((worst: number, v, i) => (v != null && (worst === -1 || v < (arr[worst] as number)) ? i : worst), -1);

/** Index of the last non-null value in a series, or -1 if all null. */
export const lastValidIdx = (arr: (number | null | undefined)[]): number => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
  return -1;
};

export const MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
export const FY2526_PIDS = monthPeriodIds("2025-2026");

/** "2025-2026" -> "FY 25-26" */
export const fyLabel = (fy: string): string => `FY ${fy.slice(2, 4)}-${fy.slice(7)}`;

// ── Format helpers ───────────────────────────────────────────────────────────
export const L = (n: number | null | undefined): string => {
  if (n == null) return "-";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n/10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${(n/100000).toFixed(1)}L`;
  if (abs >= 1000)     return `${(n/1000).toFixed(1)}K`;
  return String(Math.round(n));
};

export const pct = (n: number | null | undefined): string => (n == null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
