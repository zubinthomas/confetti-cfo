// Drizzle schema (PostgreSQL dialect). The dataset tables mirror
// src/data/extracted_data.json exactly - every field, nullability and closed
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
import type { RecordChange } from '../import/types.ts';

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

// ── Users (created via the db/users.ts CLI or by accepting an invite) ──────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name'),
  createdAt: text('created_at').notNull(),  // ISO-8601
}, (t) => [
  uniqueIndex('users_email').on(t.email),
]);

// ── RBAC (roles composed of allow/deny permission grants, ranked to resolve
// conflicts when a user holds multiple roles - see server/db/permissions.ts) ─
export const permissionEffectEnum = pgEnum('permission_effect', ['allow', 'deny']);

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  rank: integer('rank').notNull(), // higher rank wins conflicts; must be unique
  createdAt: text('created_at').notNull(), // ISO-8601
}, (t) => [
  uniqueIndex('roles_name').on(t.name),
  uniqueIndex('roles_rank').on(t.rank),
]);

// Fixed catalog owned by code (server/db/permissions.ts), upserted on boot -
// this table only exists so role_permissions has a real FK target.
export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  resource: text('resource').notNull(),
  action: text('action').notNull(), // read | write | delete
}, (t) => [
  uniqueIndex('permissions_resource_action').on(t.resource, t.action),
]);

export const rolePermissions = pgTable('role_permissions', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  effect: permissionEffectEnum('effect').notNull(),
}, (t) => [
  uniqueIndex('role_permissions_role_permission').on(t.roleId, t.permissionId),
]);

export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('user_roles_user_role').on(t.userId, t.roleId),
]);

// ── Settings (mirrors server/.env; read-only via the API for now - see
// server/routes/settings.ts. Doesn't drive runtime config yet, process.env
// still does; this is a display/audit copy populated by db/seed-settings.ts) ─
export const settingCategoryEnum = pgEnum('setting_category', [
  'server', 'security', 'llm', 'google_oauth', 'google_sheets', 'email',
]);

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  value: text('value'),
  category: settingCategoryEnum('category').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  isSecret: boolean('is_secret').notNull().default(false),
  updatedAt: text('updated_at').notNull(), // ISO-8601
}, (t) => [
  uniqueIndex('settings_key').on(t.key),
]);

// ── Workbook imports (upload → preview → commit/discard) ────────────────────
export const importStatusEnum = pgEnum('import_status', ['preview', 'committed', 'discarded']);

// Saved Google Sheets sources, re-synced on a schedule or on demand.
export const sheetAccessMethodEnum = pgEnum('sheet_access_method', ['link', 'service_account']);
// auto = commit syncs with no warning/error issues; manual = human commits; paused = skip auto-sync
export const sheetSyncModeEnum = pgEnum('sheet_sync_mode', ['auto', 'manual', 'paused']);

export const sheetSources = pgTable('sheet_sources', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  spreadsheetId: text('spreadsheet_id').notNull(),
  sheetUrl: text('sheet_url').notNull(),       // as pasted, for display/linking
  accessMethod: sheetAccessMethodEnum('access_method').notNull(),
  syncMode: sheetSyncModeEnum('sync_mode').notNull().default('manual'),
  createdAt: text('created_at').notNull(),     // ISO-8601
  lastSyncAt: text('last_sync_at'),
  lastSyncStatus: text('last_sync_status'),    // preview_created | auto_committed | no_changes | error
  lastSyncError: text('last_sync_error'),      // short summary line
  lastSyncIssues: jsonb('last_sync_issues'),   // Issue[] when the sync failed validation, else null
}, (t) => [
  uniqueIndex('sheet_sources_spreadsheet_id').on(t.spreadsheetId),
]);

export const importBatches = pgTable('import_batches', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  kind: text('kind').notNull(), // cepl | cafe | sienna
  status: importStatusEnum('status').notNull(),
  uploadedAt: text('uploaded_at').notNull(),   // ISO-8601
  committedAt: text('committed_at'),
  issues: jsonb('issues').notNull(),           // Issue[] from the parser
  stats: jsonb('stats').notNull(),             // per-table creates/updates/unchanged
  details: jsonb('details').$type<Record<string, RecordChange[]> | null>(), // row-level detail behind stats; null for pre-feature batches
  payload: jsonb('payload').notNull(),         // the ParsedWorkbook, so commit needn't re-parse
  sourceType: text('source_type').notNull().default('upload'), // upload | sheet
  sheetSourceId: integer('sheet_source_id').references(() => sheetSources.id, { onDelete: 'set null' }),
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
