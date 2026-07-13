// Drizzle schema (PostgreSQL dialect). The dataset tables mirror
// src/data/extracted_data.json exactly — every field, nullability and closed
// value set below was verified programmatically against that file:
//   - relatedAmountLineItemId / displayOrder / notes / salesRecords.businessUnitId
//     are always null in the current data but exist in the source shape,
//     so they are kept as nullable columns.
//   - value/amount/commissionRate are IEEE doubles (the JSON numbers round-trip
//     bit-exactly; numeric/decimal would come back as strings in JS).
//   - The natural keys enforced below are unique in the current data and are
//     what a re-import must upsert on.
// The app-entity tables (employees, licences, recruitments, leave_requests)
// are typed from the HR/compliance form fields; created_date stays an ISO-8601
// text column to keep the existing API contract byte-identical.
import {
  pgTable, pgEnum, integer, serial, text, doublePrecision, boolean, date, jsonb,
  uniqueIndex, unique,
} from 'drizzle-orm/pg-core';

// ── Closed value sets (verified distinct values) ─────────────────────────────
export const unitTypeEnum = pgEnum('unit_type', ['department', 'outlet']);
export const periodTypeEnum = pgEnum('period_type', ['month', 'week', 'custom']);
export const lineItemCategoryEnum = pgEnum('line_item_category', [
  'revenue', 'cogs', 'hr_cost', 'operating_cost', 'subtotal', 'other',
]);
export const valueTypeEnum = pgEnum('value_type', ['amount', 'percentage']);
export const vendorGroupEnum = pgEnum('vendor_group', ['consignment', 'other_brands']);

// ── Dataset tables (from the Excel extraction) ───────────────────────────────
export const businesses = pgTable('businesses', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull(),
});

export const businessUnits = pgTable('business_units', {
  id: integer('id').primaryKey(),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(),
  unitType: unitTypeEnum('unit_type').notNull(),
});

export const periods = pgTable('periods', {
  id: integer('id').primaryKey(),
  periodType: periodTypeEnum('period_type').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  label: text('label').notNull(),
  fiscalYear: text('fiscal_year').notNull(),
  isSpecialEvent: boolean('is_special_event').notNull(),
});

export const lineItems = pgTable('line_items', {
  id: integer('id').primaryKey(),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(),
  category: lineItemCategoryEnum('category').notNull(),
  valueType: valueTypeEnum('value_type').notNull(),
  relatedAmountLineItemId: integer('related_amount_line_item_id'),
  displayOrder: integer('display_order'),
});

export const financialRecords = pgTable('financial_records', {
  id: integer('id').primaryKey(),
  businessUnitId: integer('business_unit_id').notNull().references(() => businessUnits.id),
  periodId: integer('period_id').notNull().references(() => periods.id),
  lineItemId: integer('line_item_id').notNull().references(() => lineItems.id),
  value: doublePrecision('value').notNull(),
  notes: text('notes'),
}, (t) => [
  uniqueIndex('financial_records_natural_key').on(t.businessUnitId, t.periodId, t.lineItemId),
]);

export const categories = pgTable('categories', {
  id: integer('id').primaryKey(),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(),
});

export const channels = pgTable('channels', {
  id: integer('id').primaryKey(),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(),
});

export const salesRecords = pgTable('sales_records', {
  id: integer('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => periods.id),
  categoryId: integer('category_id').references(() => categories.id), // null = channel-level total row
  channelId: integer('channel_id').notNull().references(() => channels.id),
  businessUnitId: integer('business_unit_id').references(() => businessUnits.id),
  amount: doublePrecision('amount').notNull(),
}, (t) => [
  unique('sales_records_natural_key').on(t.periodId, t.categoryId, t.channelId).nullsNotDistinct(),
]);

export const vendors = pgTable('vendors', {
  id: integer('id').primaryKey(),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(),
  commissionRate: doublePrecision('commission_rate'),
  group: vendorGroupEnum('group').notNull(),
});

export const consignmentRecords = pgTable('consignment_records', {
  id: integer('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => periods.id),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  amount: doublePrecision('amount').notNull(),
  commissionRate: doublePrecision('commission_rate'),
}, (t) => [
  uniqueIndex('consignment_records_natural_key').on(t.periodId, t.vendorId),
]);

// Provenance / notes carried over from the extraction (_meta), one row
export const datasetMeta = pgTable('dataset_meta', {
  id: integer('id').primaryKey(),
  meta: jsonb('meta').notNull(),
});

// ── Workbook imports (upload → preview → commit/discard) ────────────────────
export const importStatusEnum = pgEnum('import_status', ['preview', 'committed', 'discarded']);

export const importBatches = pgTable('import_batches', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  kind: text('kind').notNull(), // cepl | cafe | sienna
  status: importStatusEnum('status').notNull(),
  uploadedAt: text('uploaded_at').notNull(),   // ISO-8601
  committedAt: text('committed_at'),
  issues: jsonb('issues').notNull(),           // Issue[] from the parser
  stats: jsonb('stats').notNull(),             // per-table creates/updates/unchanged
  payload: jsonb('payload').notNull(),         // the ParsedWorkbook, so commit needn't re-parse
});

// ── App entities (HR & compliance forms) ─────────────────────────────────────
export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(), // ISO-8601, matches the previous JSON store
  fullName: text('full_name'),
  employeeId: text('employee_id'),
  division: text('division'),
  role: text('role'),
  employmentType: text('employment_type'),
  status: text('status'),
  joiningDate: text('joining_date'),
  monthlySalary: doublePrecision('monthly_salary'),
  phone: text('phone'),
  email: text('email'),
  aadharNumber: text('aadhar_number'),
  panNumber: text('pan_number'),
  bloodGroup: text('blood_group'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  address: text('address'),
  notes: text('notes'),
  policeVerificationStatus: text('police_verification_status'),
  idProofUrl: text('id_proof_url'),
  contractUrl: text('contract_url'),
  policeVerificationUrl: text('police_verification_url'),
  healthRecordUrl: text('health_record_url'),
});

export const licences = pgTable('licences', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  licenceName: text('licence_name'),
  licenceType: text('licence_type'),
  authority: text('authority'),
  location: text('location'),
  division: text('division'),
  licenceNumber: text('licence_number'),
  issueDate: text('issue_date'),
  expiryDate: text('expiry_date'),
  status: text('status'),
  renewalReminderDays: integer('renewal_reminder_days'),
  annualFee: doublePrecision('annual_fee'),
  notes: text('notes'),
  documentUrl: text('document_url'),
});

export const recruitments = pgTable('recruitments', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  roleTitle: text('role_title'),
  division: text('division'),
  openings: integer('openings'),
  applicantName: text('applicant_name'),
  applicantEmail: text('applicant_email'),
  applicantPhone: text('applicant_phone'),
  stage: text('stage'),
  expectedSalary: doublePrecision('expected_salary'),
  notes: text('notes'),
});

export const leaveRequests = pgTable('leave_requests', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  employeeName: text('employee_name'),
  division: text('division'),
  leaveType: text('leave_type'),
  fromDate: text('from_date'),
  toDate: text('to_date'),
  days: doublePrecision('days'),
  reason: text('reason'),
  status: text('status'),
});
