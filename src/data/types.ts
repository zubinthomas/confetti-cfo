// Dataset model (field-verified against the Excel extraction) shared by the
// filtered hooks (useReferenceData/useFinancialRecords/useSalesRecords/
// useConsignmentRecords) and the pure computation modules built on top of
// them (seriesKernel.ts, outletData.ts, storeSalesData.ts, etc).
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
