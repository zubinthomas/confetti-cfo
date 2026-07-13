// ─────────────────────────────────────────────────────────────────────────────
// Shared foundation for the data adapters (ceplData / storeData /
// fnbOutletData / cashFlowData / aiContext): raw table access over
// ./extracted_data.json plus the lookup and formatting helpers they build on.
//
// Nothing here is hand-entered — every number the adapters derive comes from
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

import rawJson from "./extracted_data.json";

// ── Dataset model (field-verified against extracted_data.json) ──────────────
export interface Business { id: number; name: string; slug: string; description: string }
export interface BusinessUnit { id: number; businessId: number; name: string; unitType: "department" | "outlet" }
export interface Period {
  id: number;
  periodType: "month" | "week" | "custom";
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  label: string;
  fiscalYear: string;  // e.g. "2025-2026"
  isSpecialEvent: boolean;
}
export type LineItemCategory = "revenue" | "cogs" | "hr_cost" | "operating_cost" | "subtotal" | "other";
export interface LineItem {
  id: number;
  businessId: number;
  name: string;
  category: LineItemCategory;
  valueType: "amount" | "percentage";
  relatedAmountLineItemId: number | null;
  displayOrder: number | null;
}
export interface FinancialRecord {
  id: number;
  businessUnitId: number;
  periodId: number;
  lineItemId: number;
  value: number;       // percentages stored as fractions (0.296 = 29.6%)
  notes: string | null;
}
export interface Category { id: number; businessId: number; name: string }
export interface Channel { id: number; businessId: number; name: string }
export interface SalesRecord {
  id: number;
  periodId: number;
  categoryId: number | null;  // null = channel-level total row
  channelId: number;
  businessUnitId: number | null;
  amount: number;
}
export interface Vendor {
  id: number;
  businessId: number;
  name: string;
  commissionRate: number | null;
  group: "consignment" | "other_brands";
}
export interface ConsignmentRecord {
  id: number;
  periodId: number;
  vendorId: number;
  amount: number;
  commissionRate: number | null;
}
export interface Dataset {
  businesses: Business[];
  businessUnits: BusinessUnit[];
  periods: Period[];
  lineItems: LineItem[];
  financialRecords: FinancialRecord[];
  categories: Category[];
  channels: Channel[];
  salesRecords: SalesRecord[];
  vendors: Vendor[];
  consignmentRecords: ConsignmentRecord[];
}

const raw = rawJson as unknown as Dataset;

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

export const MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
export const FY2526_PIDS = monthPeriodIds("2025-2026");

// ── Format helpers ───────────────────────────────────────────────────────────
export const L = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n/10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${(n/100000).toFixed(1)}L`;
  if (abs >= 1000)     return `${(n/1000).toFixed(1)}K`;
  return String(Math.round(n));
};

export const pct = (n: number | null | undefined): string => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
