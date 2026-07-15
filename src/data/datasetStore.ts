// Holds the dataset fetched from GET /api/dataset (the database-backed copy
// of the verified Excel extraction).
//
// The adapters (core/ceplData/storeData/…) compute their aggregates at module
// evaluation time, so the app loads them through a lazy chunk that React only
// imports AFTER setDataset() has run - see DatasetGate in src/App.tsx. Nothing
// outside that chunk may import the adapters.

// ── Dataset model (field-verified against the extraction) ───────────────────
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

let dataset: Dataset | null = null;

export function setDataset(d: Dataset): void {
  dataset = d;
}

export function getDataset(): Dataset {
  if (!dataset) {
    throw new Error(
      "Dataset not loaded - the data adapters were imported before DatasetGate fetched /api/dataset."
    );
  }
  return dataset;
}
