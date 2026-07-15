// Parsed-workbook model: the same tables as the dataset, but identified by
// natural keys instead of database ids (the merge step resolves/allocates ids).

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  sheet: string;
  message: string;
}

/** One field's value before/after a merge-plan update (or after, for a create). */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** Row-level detail behind a merge-plan's aggregate creates/updates counts. */
export interface RecordChange {
  action: 'create' | 'update';
  description: string;
  fields?: FieldChange[];
}

export interface ParsedPeriod {
  periodType: 'month' | 'week' | 'custom';
  startDate: string; // YYYY-MM-DD
  endDate: string;
  label: string;
  fiscalYear: string;
  isSpecialEvent: boolean;
}

export interface ParsedLineItem {
  businessName: string;
  name: string;
  category: 'revenue' | 'cogs' | 'hr_cost' | 'operating_cost' | 'subtotal' | 'other';
  valueType: 'amount' | 'percentage';
}

export interface ParsedFinancialRecord {
  businessName: string;
  unitName: string;
  unitType: 'department' | 'outlet';
  // period natural key
  periodStart: string;
  periodEnd: string;
  periodType: 'month' | 'week' | 'custom';
  // line item natural key
  lineItemName: string;
  valueType: 'amount' | 'percentage';
  value: number;
}

export interface ParsedSalesRecord {
  periodStart: string;
  periodEnd: string;
  periodType: 'month';
  categoryName: string | null; // null = channel-level total row
  channelName: string;
  amount: number;
}

export interface ParsedConsignmentRecord {
  periodStart: string;
  periodEnd: string;
  periodType: 'month';
  vendorName: string;
  vendorGroup: 'consignment' | 'other_brands';
  amount: number;
  commissionRate: number | null;
}

export interface ParsedWorkbook {
  kind: 'cepl' | 'cafe' | 'sienna';
  businessName: string;
  periods: ParsedPeriod[];
  financialRecords: ParsedFinancialRecord[];
  salesRecords: ParsedSalesRecord[];
  consignmentRecords: ParsedConsignmentRecord[];
  issues: Issue[];
}

export const MONTH_NAMES = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
] as const;

/** Fiscal year string ("2025-2026") for a calendar year+month (1-12). */
export function fiscalYearOf(year: number, month: number): string {
  const start = month >= 4 ? year : year - 1;
  return `${start}-${start + 1}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Month period natural key + label for a given calendar year/month. */
export function monthPeriod(year: number, month: number): ParsedPeriod {
  const start = `${year}-${pad2(month)}-01`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const end = `${endYear}-${pad2(endMonth)}-01`;
  const monthName = MONTH_NAMES[(month + 8) % 12]; // 4->April ... 3->March
  return {
    periodType: 'month',
    startDate: start,
    endDate: end,
    label: `${monthName} ${year}`,
    fiscalYear: fiscalYearOf(year, month),
    isSpecialEvent: false,
  };
}

/** The workbook's percentage/amount heuristic: |v| <= 1.5 is a fraction. */
export function valueTypeOf(v: number): 'amount' | 'percentage' {
  return Math.abs(v) <= 1.5 ? 'percentage' : 'amount';
}

/** Unlabeled-row policy: a hand-typed value in a row without a label is data
 *  missing its label (an error the source must fix) only when it looks like a
 *  real amount. The workbooks' unlabeled ratio scratch rows run up to ~2x
 *  (purchase-to-sales lines), slightly past the 1.5 fraction cutoff, so this
 *  uses its own margin - real amounts are orders of magnitude larger. */
export function looksLikeUnlabeledData(values: number[]): boolean {
  return values.some((v) => Math.abs(v) > 5);
}

/** Keyword classification for NEW line items (existing ones keep their category). */
export function classifyLineItem(name: string, valueType: 'amount' | 'percentage'): ParsedLineItem['category'] {
  const n = name.toLowerCase();
  if (/total|p\+l|profit|net /.test(n)) return 'subtotal';
  if (/sales|revenue|receipt/.test(n)) return 'revenue';
  if (/raw material|purchase|perishable|cogs/.test(n)) return 'cogs';
  if (/salary|hr |hr cost|welfare|wellfare|staff/.test(n)) return 'hr_cost';
  if (valueType === 'percentage' || /cost|fee|charge|expense|maintenance|marketing|commission|licen|legal|insurance|gst|tax|rent/.test(n)) return 'operating_cost';
  return 'other';
}
