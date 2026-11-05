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

// One HR Mastersheet row, matched against existing `employees` rows by
// Aadhaar (falling back to full name when Aadhaar is blank - see
// server/import/mergeEmployees.ts). Only the fields the sheet actually
// supplies are listed here; manual-only fields (salary, documents, notes,
// ...) have no representation in the parsed shape at all, so there's
// nothing for the merge step to accidentally overwrite.
export interface ParsedEmployeeRecord {
  fullName: string;
  division: string;
  role: string;
  employmentType: string;
  status: string;
  joiningDate: string; // YYYY-MM-DD
  phone: string | null;
  email: string | null;
  aadharNumber: string | null;
  panNumber: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  gender: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  reportingManager: string | null;
  location: string | null;
  potteryGrade: number | null;
  bankAccountNumber: string | null;
  ifscCode: string | null;
}

// One (month, category) target from the FY26-27 Target Plan sheet's "FY26-27
// Store Target"/"FY26-27 F&B Target" columns - main categories only, no
// sub-category breakdown (deferred pending separate feedback, not parsed here).
export interface ParsedTargetRecord {
  periodStart: string;
  periodEnd: string;
  periodType: 'month';
  category: 'store' | 'fnb';
  amount: number;
}

// One row of the pottery factory's production log (server/import/
// parseProduction.ts), across all four stages of Green Production (throwing,
// finishing) / Glaze Application / Kiln Firing. Matched against existing
// `production_log` rows by (sourceSheet, sourceRow) - see
// server/import/mergeProductionLog.ts. Stage-specific fields are null when
// not applicable to that row's stage.
export interface ParsedProductionLogRecord {
  stage: 'throwing' | 'finishing' | 'glazing' | 'firing';
  date: string | null; // YYYY-MM-DD
  orderName: string | null;
  productName: string | null;
  qty: number | null;
  qtyRaw: string | null; // preserves unparseable text like "4 pcs"
  throwingQty: number | null;
  turningQty: number | null;
  potterName: string | null;
  finisherName: string | null;
  glazeType: string | null;
  kiln: string | null;
  firingType: string | null;
  remarks: string | null;
  sourceSheet: string;
  sourceRow: number;
}

// One employee/day of a weekly shift roster (server/import/parseRoster.ts).
// One record is emitted per day per employee row in the source (Mon-Sun),
// matched against existing `shift_roster` rows by (employeeName, date) - see
// server/import/mergeShiftRoster.ts. This is a planned schedule, not an
// attendance/actuals record.
export interface ParsedShiftRosterRecord {
  employeeName: string;
  division: string | null;
  functionalArea: string | null;
  designation: string | null;
  gender: string | null;
  date: string; // YYYY-MM-DD
  weekStart: string; // YYYY-MM-DD, the Monday from the sheet's title row
  shiftRaw: string | null;
  isOff: boolean;
  shiftStart: string | null; // HH:MM
  shiftEnd: string | null; // HH:MM
  breakSlot: string | null;
  weeklyOffDay: string | null;
}

// One client order-status row (server/import/parseOrders.ts) - a
// current-state snapshot of a single SKU's progress through the shared
// production pipeline (Green -> Drawing[Dubai only] -> Bisque -> Glaze
// Application -> Glaze Firing -> Ready), not a time series. Matched against
// existing `order_lines` rows by client + normalized item name/size/colour
// (row position isn't stable across re-uploads) - see
// server/import/mergeOrders.ts. Dispatch date reads as a planned/target
// date, not a confirmed-actual one.
export interface ParsedOrderRecord {
  client: string;
  itemName: string;
  size: string | null;
  colour: string | null;
  orderQty: number | null;
  greenQty: number | null;
  drawingQty: number | null;
  bisqueQty: number | null;
  glazeAppQty: number | null;
  glazeFiringQty: number | null;
  readyQty: number | null;
  dispatchDate: string | null; // YYYY-MM-DD
  sampleStatus: string | null;
  remarks: string | null;
  sourceSheet: string;
  sourceRow: number;
}

// One outstanding bill from Tally's bill-wise sync (server/tally/sync.ts,
// agent/src/tally_client.rs's fetch_bills + classify_bills) - a current-state
// snapshot of what's presently outstanding, not a time series. `nature` is
// decided agent-side by the bill's own ledger group, not by which Tally
// report it came from (neither "Bills Receivable" nor "Bills Payable" is
// cleanly scoped by that on the real install - confirmed 2026-10-16).
// Matched against existing `tally_bills` rows by (tallySourceId, ledgerName,
// billRef) - see server/import/mergeBills.ts's `billMatchKey`. Unlike
// order_lines (whose closest-precedent "never delete, keep last-known state"
// policy doesn't transfer here - a cleared bill's last-known state would be
// actively wrong), a bill missing from a later sync gets marked resolved,
// not just left stale.
export interface ParsedBillRecord {
  tallySourceId: number;
  ledgerName: string;
  billRef: string;
  billDate: string | null; // YYYY-MM-DD
  nature: 'receivable' | 'payable';
  outstandingAmount: number;
  dueDate: string | null; // YYYY-MM-DD
  voucherDate: string | null;
  voucherType: string | null;
  voucherNumber: string | null;
  voucherAmount: number | null;
}

// One restaurant bill/order pushed by PetPooja's Sales API webhook
// (server/petpooja/parseSalesPayload.ts) - one webhook call = one order, a
// real-time push on "SAVE AND PRINT" at the POS, not a resync of a current-
// state snapshot. A cancelled bill is a normal re-push of the same orderID
// with status flipped to 'Cancelled', not a separate notice - so unlike
// ParsedBillRecord (whose source "missing from latest sync -> resolved"
// policy doesn't transfer here), this is create/update-only: see
// server/import/mergePetpoojaSales.ts. Matched by (petpoojaSourceId,
// normalized orderId).
export interface ParsedPetpoojaSalesRecord {
  petpoojaSourceId: number;
  orderId: string;
  customerInvoiceId: string | null;
  restId: string | null;
  orderType: string | null;
  paymentType: string | null;
  orderFrom: string | null;
  orderFromId: string | null;
  subOrderType: string | null;
  status: string | null;
  tableNo: string | null;
  noOfPersons: number | null;
  billerName: string | null;
  assignee: string | null;
  comment: string | null;
  tokenNo: string | null;
  deliveryCharges: number | null;
  packagingCharge: number | null;
  serviceCharge: number | null;
  discountTotal: number | null;
  taxTotal: number | null;
  roundOff: number | null;
  coreTotal: number | null;
  total: number | null;
  orderCreatedAt: string | null; // UTC instant, converted from PetPooja's naive-IST created_on
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerGstin: string | null;
  items: unknown; // OrderItem[], incl. nested addons, kept as PetPooja sent them
  taxBreakup: unknown; // Tax[]
  discountBreakup: unknown; // Discount[]
  partPayments: unknown; // only present when paymentType is 'Part Payment'
}

// One row from the HP/JP/Daranda licence-tax sheets, or the Insurance
// sheet, of the Compliance Payment Tracker workbook
// (server/import/parseCompliance.ts). `paidOn` is set ONLY from an
// explicit source "Date Of Payment" column - never inferred from
// scheduledFollowUp or paymentStatus (see parseCompliance.ts's structural
// validator, which skips a whole sheet rather than guess at this). Matched
// against existing `compliance_payments` rows by policyNumber (Insurance)
// or (location, itemName, detail, dueDate) (licence_tax) - see
// server/import/mergeCompliance.ts's compliancePaymentMatchKey.
export interface ParsedCompliancePaymentRecord {
  category: 'licence_tax' | 'insurance';
  location: string; // 'HP' | 'JP' | 'Daranda'
  itemName: string;
  detail: string | null;
  policyNumber: string | null;
  dueDateRaw: string | null;
  dueDate: string | null; // YYYY-MM-DD
  amount: number | null;
  paymentStatus: string | null;
  paidOn: string | null; // YYYY-MM-DD
  scheduledFollowUpRaw: string | null;
  scheduledFollowUp: string | null; // YYYY-MM-DD
  remarks: string | null;
  sourceSheet: string;
  sourceRow: number;
}

// One row from the Company Docs sheet - a statutory document register, not
// a recurring payment (no amount/due-date/payment-status concept). Matched
// against existing `compliance_documents` rows by (documentName,
// documentType) - see server/import/mergeCompliance.ts.
export interface ParsedComplianceDocumentRecord {
  documentName: string;
  documentType: string | null;
  documentNumber: string | null;
  issueDateRaw: string | null;
  issueDate: string | null;
  filingDateRaw: string | null;
  filingDate: string | null;
  expiryDateRaw: string | null;
  expiryDate: string | null;
  status: string | null;
  remarks: string | null;
}

// One row from the TM sheet - a trademark application/filing-status
// pipeline. Matched against existing `compliance_trademarks` rows by
// applicationNo (government-assigned, strong key) - see
// server/import/mergeCompliance.ts. Intentionally not cross-referenced
// against compliance_documents even though one real trademark
// (application 3160344) appears in both sheets - the source maintainer
// duplicates it on purpose (live filing-status pipeline vs. permanent
// document register).
export interface ParsedComplianceTrademarkRecord {
  applicationNo: string;
  niceClass: number | null;
  dateOfApplicationRaw: string | null;
  dateOfApplication: string | null;
  markName: string | null;
  tmType: string | null;
  status: string | null;
  remarks: string | null;
}

// One row from the DIR KYC sheet. Matched against existing
// `compliance_directors` rows by din (government-assigned, strong key) -
// see server/import/mergeCompliance.ts. Gated server-side by its own
// 'DirectorKyc' permission resource, not the broad 'Licence' resource the
// other three compliance record types use - see server/db/permissions.ts.
export interface ParsedComplianceDirectorRecord {
  din: string;
  name: string | null;
  designation: string | null;
  dateOfAppointmentRaw: string | null;
  dateOfAppointment: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  email: string | null;
  contactNumber: string | null;
}

// PetPooja's full item catalog, pushed wholesale on every Menu Push webhook
// call or pulled on demand via Fetch Menu (server/petpooja/parseMenuPayload.ts)
// - every call is the merchant's *entire* current catalog, not an
// incremental diff, unlike ParsedPetpoojaSalesRecord above. A single object,
// not an array like every other kind's own `xRecords: T[]` field: all 5
// entity sets + the restaurant-level config blob must be validated and
// swept atomically against one source's existing state (see
// server/import/mergeMenu.ts's resolve-sweep), not processed as independent
// record pushes.
export interface ParsedPetpoojaMenuCategory {
  categoryId: string; parentCategoryId: string | null; name: string;
  rank: number | null; timings: string | null; imageUrl: string | null; active: boolean;
}

export interface ParsedPetpoojaMenuItem {
  itemId: string;
  categoryId: string | null; // raw PetPooja category id, natural-key only (see schema.ts)
  name: string; description: string | null;
  price: number | null; markupPrice: number | null; rank: number | null;
  attributeId: string | null; // 1=Veg,2=NonVeg,5=Other,24=Egg
  allowVariation: boolean; allowAddon: boolean; addonBasedOnVariation: boolean;
  orderTypeRaw: string | null; gstType: string | null; taxInclusive: boolean;
  ignoreTaxes: boolean; ignoreDiscounts: boolean; packingCharges: number | null;
  isRecommended: boolean; isFavorite: boolean; isCombo: boolean; imageUrl: string | null;
  minimumPreparationTime: string | null; spiceLevel: string | null;
  itemTax: unknown; // id list
  variations: unknown; // vendor doc types this "string" but describes an array - stored verbatim
  addon: unknown; // same vendor doc gap - the only place an item's add-on-group association exists
  comboDetails: unknown; nutrition: unknown; cuisine: unknown; tags: unknown;
  active: boolean;
}

export interface ParsedPetpoojaMenuAddonGroup {
  addonGroupId: string; name: string; rank: number | null; active: boolean;
}

// Flat master list - no addonGroupId of its own (confirmed against
// PetPooja's live docs: the item↔group↔addon-item link lives only on each
// item's own `addon` field).
export interface ParsedPetpoojaMenuAddonItem {
  addonItemId: string; name: string; price: number | null;
  attributeId: string | null; rank: number | null; active: boolean;
}

export interface ParsedPetpoojaMenuTax {
  taxId: string; name: string; rate: number | null; taxType: string | null;
  orderTypeRaw: string | null; coreOrTotal: string | null; forwardOrBackward: string | null;
  description: string | null; rank: number | null; active: boolean;
}

export interface ParsedPetpoojaMenuPayload {
  petpoojaSourceId: number;
  categories: ParsedPetpoojaMenuCategory[];
  items: ParsedPetpoojaMenuItem[];
  addonGroups: ParsedPetpoojaMenuAddonGroup[];
  addonItems: ParsedPetpoojaMenuAddonItem[];
  taxes: ParsedPetpoojaMenuTax[];
  configRaw: unknown; // restaurant-level config + the entity kinds with no consumer yet, verbatim
  sourceKind: 'push' | 'fetch';
}

// Item Stock On/Off (step 5) - a targeted list of ids to flip, not a
// snapshot (contrast ParsedPetpoojaMenuPayload above). autoTurnOnTime/
// customTurnOnTime are recorded, never acted on - see petpoojaMenuItems'
// schema comment.
export interface ParsedPetpoojaStockPayload {
  petpoojaSourceId: number;
  type: 'item' | 'addon';
  inStock: boolean;
  itemIds: string[];
  autoTurnOnTime: string | null;
  customTurnOnTime: string | null;
}

// Order Callback (step 6) - PetPooja notifying us of a status change on an
// order *we* placed via Save Order. orderId is OUR own clientOrderId (see
// petpoojaOutboundOrders' schema comment) - PetPooja's doc text for this
// field: "Unique client order id which is used to update order status at
// client side", despite the same field name meaning PetPooja's own
// (optional, deprecated) id elsewhere in this API family.
export interface ParsedPetpoojaOrderCallbackPayload {
  petpoojaSourceId: number;
  orderId: string;
  status: string | null; // raw PetPooja status code, mapping happens in mergeOrderCallback.ts
  cancelReason: string | null;
  minimumPrepTime: string | null;
  minimumDeliveryTime: string | null;
  riderName: string | null;
  riderPhoneNumber: string | null;
  isModified: boolean;
}

export interface ParsedWorkbook {
  kind: 'cepl' | 'cafe' | 'sienna' | 'hr' | 'target' | 'fnbMonthly' | 'fnbWeekly' | 'potteryProduction' | 'shiftRoster' | 'orders' | 'bills' | 'compliance' | 'petpoojaSales' | 'petpoojaMenu' | 'petpoojaStock' | 'petpoojaOrderCallback';
  businessName: string;
  periods: ParsedPeriod[];
  financialRecords: ParsedFinancialRecord[];
  salesRecords: ParsedSalesRecord[];
  consignmentRecords: ParsedConsignmentRecord[];
  employeeRecords: ParsedEmployeeRecord[];
  targetRecords: ParsedTargetRecord[];
  productionLogRecords: ParsedProductionLogRecord[];
  shiftRosterRecords: ParsedShiftRosterRecord[];
  orderRecords: ParsedOrderRecord[];
  billRecords: ParsedBillRecord[];
  petpoojaSalesRecords: ParsedPetpoojaSalesRecord[];
  petpoojaMenuPayload: ParsedPetpoojaMenuPayload | null;
  petpoojaStockPayload: ParsedPetpoojaStockPayload | null;
  petpoojaOrderCallbackPayload: ParsedPetpoojaOrderCallbackPayload | null;
  compliancePaymentRecords: ParsedCompliancePaymentRecord[];
  complianceDocumentRecords: ParsedComplianceDocumentRecord[];
  complianceTrademarkRecords: ParsedComplianceTrademarkRecord[];
  complianceDirectorRecords: ParsedComplianceDirectorRecord[];
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
