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
  uniqueIndex, unique, type AnyPgColumn,
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
export const revenueTargetCategoryEnum = pgEnum('revenue_target_category', ['store', 'fnb']);

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

export const revenueTargets = pgTable('revenue_targets', {
  id: integer('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => periods.id),
  category: revenueTargetCategoryEnum('category').notNull(),
  targetAmount: doublePrecision('target_amount').notNull(),
}, (t) => [
  uniqueIndex('revenue_targets_natural_key').on(t.periodId, t.category),
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
  active: boolean('active').notNull().default(true), // deactivated users are 401'd on every request - see middleware/auth.ts
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
  rank: integer('rank').notNull(), // lower rank wins conflicts (0 = highest priority); must be unique, >= 0
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

// Row-level narrowing on top of the Employee/Licence/Recruitment/
// LeaveRequest permissions above - orthogonal to roles/permissions, not a
// replacement. No rows for a user = unrestricted (today's behavior); one or
// more rows = restricted to exactly those divisions. See
// server/db/divisionScope.ts.
export const userDivisionScopes = pgTable('user_division_scopes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  division: text('division').notNull(),
}, (t) => [
  uniqueIndex('user_division_scopes_user_division').on(t.userId, t.division),
]);

// Direct per-user permission grants/denies - same shape as role_permissions,
// but always takes precedence over any role (see hasPermission in
// server/db/permissions.ts). This is what an accepted invite's chosen
// permissions become; also manageable directly via the user-permission:*
// CLI commands (server/db/roles.ts) for existing users.
export const userPermissions = pgTable('user_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permissionId: integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  effect: permissionEffectEnum('effect').notNull(),
}, (t) => [
  uniqueIndex('user_permissions_user_permission').on(t.userId, t.permissionId),
]);

// ── Invites (accounts are created via the CLI or by accepting an invite -
// there is no open self-registration path) ──────────────────────────────────
export const inviteStatusEnum = pgEnum('invite_status', ['pending', 'accepted', 'revoked']);

export const invites = pgTable('invites', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  token: text('token').notNull(),
  status: inviteStatusEnum('status').notNull().default('pending'),
  invitedByUserId: integer('invited_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),   // ISO-8601
  expiresAt: text('expires_at').notNull(),   // ISO-8601
  acceptedAt: text('accepted_at'),
  acceptedUserId: integer('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Set when this invite is for linking a specific employee record to a new
  // self-service login (see server/db/employeeSelf.ts) - null for ordinary
  // staff invites.
  employeeId: text('employee_id').references(() => employees.id, { onDelete: 'set null' }),
}, (t) => [
  uniqueIndex('invites_token').on(t.token),
]);

// The permissions an invite will grant on acceptance - allow-only (a fresh
// account starts with exactly this set, nothing to override yet), clamped at
// create/edit time to permissions the inviter themselves currently holds.
export const invitePermissions = pgTable('invite_permissions', {
  id: serial('id').primaryKey(),
  inviteId: integer('invite_id').notNull().references(() => invites.id, { onDelete: 'cascade' }),
  permissionId: integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('invite_permissions_invite_permission').on(t.inviteId, t.permissionId),
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
  emergencyContactRelation: text('emergency_contact_relation'),
  address: text('address'),
  notes: text('notes'),
  // Populated by the HR Mastersheet import (server/import/parseHr.ts) -
  // none of these have a manual-entry form field yet, so they're only
  // ever set by import and shown read-only in the employee detail panel.
  gender: text('gender'),
  dateOfBirth: text('date_of_birth'),
  reportingManager: text('reporting_manager'),
  // Real FK counterpart to reportingManager (free text, kept as-is for names
  // that don't resolve to an employee row) - this is what per-manager
  // scoping (server/db/managerScope.ts) actually walks. Nullable/optional:
  // most employees won't have this set until picked from the form dropdown.
  managerId: text('manager_id').references((): AnyPgColumn => employees.id, { onDelete: 'set null' }),
  location: text('location'),
  potteryGrade: integer('pottery_grade'),
  bankAccountNumber: text('bank_account_number'),
  ifscCode: text('ifsc_code'),
  policeVerificationStatus: text('police_verification_status'),
  idProofUrl: text('id_proof_url'),
  contractUrl: text('contract_url'),
  policeVerificationUrl: text('police_verification_url'),
  healthRecordUrl: text('health_record_url'),
  aadharUrl: text('aadhar_url'),
  panUrl: text('pan_url'),
  offerLetterUrl: text('offer_letter_url'),
  // Unlike the single-file slots above, an employee can have any number of
  // these - a child table would be the normal-form choice, but the generic
  // entity CRUD (server/db.ts) only ever reads/writes whole rows, so a JSON
  // array column is what lets this reuse that layer instead of needing a
  // dedicated route.
  internalDocuments: jsonb('internal_documents').$type<{ label: string; url: string; uploadedAt: string }[]>(),
  // Links this HR record to a login account for employee self-service (see
  // server/db/employeeSelf.ts) - most employees have none. Set when an
  // invite created with this employeeId (server/db/invites.ts) is accepted.
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  // A profile field (used on the generated ID card), not a compliance
  // document - deliberately not alongside the doc-URL columns above.
  photoUrl: text('photo_url'),
}, (t) => [
  uniqueIndex('employees_user_id').on(t.userId),
]);

// One row per employee per recorded month - not auto-generated by any job,
// HR records a month explicitly (see server/db/employeeDocs equivalent on
// the frontend, src/lib/employeeDocs.ts, for slip generation from these
// rows). division is a denormalized copy of the employee's division at
// record time, purely so this table can be added to server/db.ts's TABLES
// map and inherit the existing generic-entity division scoping unmodified.
export const payrollRecords = pgTable('payroll_records', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  division: text('division'),
  month: text('month').notNull(), // 'YYYY-MM'
  grossSalary: doublePrecision('gross_salary'),
  // Optional itemized breakdown - all nullable, all purely additive detail
  // below grossSalary (which stays the authoritative total used everywhere
  // else). A record with none of these set renders identically to before
  // this feature existed. Flat columns rather than a child table: the
  // component set is small, fixed, and one-per-month, unlike
  // employees.internalDocuments' unbounded-cardinality case.
  basicPay: doublePrecision('basic_pay'),
  hra: doublePrecision('hra'),
  otherAllowances: doublePrecision('other_allowances'),
  bonus: doublePrecision('bonus'),
  pfDeduction: doublePrecision('pf_deduction'),
  taxDeduction: doublePrecision('tax_deduction'),
  otherDeductions: doublePrecision('other_deductions'),
}, (t) => [
  uniqueIndex('payroll_records_employee_month').on(t.employeeId, t.month),
]);

export const employeeExitTypeEnum = pgEnum('employee_exit_type', ['resignation', 'termination', 'end_of_contract']);

// One row per offboarding event, created atomically with employees.status
// flipping to 'Terminated' by POST /api/employees/:id/offboard (see
// server/routes/entities.ts) - never by the generic entity CRUD directly,
// since that side effect has to happen in the same transaction. Otherwise a
// plain generic entity (server/db.ts's TABLES map), same as payrollRecords.
export const employeeExits = pgTable('employee_exits', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  division: text('division'),
  exitType: employeeExitTypeEnum('exit_type').notNull(),
  noticeDate: text('notice_date'),
  lastWorkingDate: text('last_working_date'),
  reason: text('reason'),
  exitInterviewNotes: text('exit_interview_notes'),
  assetsReturned: boolean('assets_returned').notNull().default(false),
  fullSettlementDone: boolean('full_settlement_done').notNull().default(false),
  rehireEligible: boolean('rehire_eligible').notNull().default(true),
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
  // Same shape convention as employees.internalDocuments - a small,
  // per-row-varying checklist, so jsonb over a child table for the same
  // reason (generic entity CRUD only reads/writes whole rows).
  checklist: jsonb('checklist').$type<{ label: string; done: boolean }[]>(),
  // Set atomically by POST /api/recruitment/:id/hire (server/routes/
  // recruitmentHire.ts) alongside stage='Hired' - null until then.
  convertedEmployeeId: text('converted_employee_id').references(() => employees.id, { onDelete: 'set null' }),
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

// ── Inventory (department-scoped stock catalog + append-only ledger) ────────
// The catalog - a plain generic entity (server/db.ts's TABLES map), so
// list/create/edit/delete and division scoping all come for free, same as
// employees/payrollRecords. quantityOnHand is a cached running balance,
// kept in sync by inventoryLedger.ts whenever a transaction is recorded -
// it is not the source of truth, inventory_transactions is.
export const inventoryItems = pgTable('inventory_items', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  name: text('name'),
  sku: text('sku'),
  division: text('division'),
  category: text('category'),
  unit: text('unit'),
  quantityOnHand: doublePrecision('quantity_on_hand').notNull().default(0),
  reorderThreshold: doublePrecision('reorder_threshold'),
  unitCost: doublePrecision('unit_cost'),
  notes: text('notes'),
});

export const inventoryTransactionTypeEnum = pgEnum('inventory_transaction_type', ['in', 'out']);

// Append-only - no update/delete surface. A mistake is corrected with an
// offsetting transaction, not by editing history (see
// server/db/inventoryLedger.ts).
export const inventoryTransactions = pgTable('inventory_transactions', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  itemId: text('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  type: inventoryTransactionTypeEnum('type').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  note: text('note'),
  recordedByUserId: integer('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
});

// ── Reservations (Cafe/Restaurant table booking with real capacity/overlap
// enforcement) ────────────────────────────────────────────────────────────
// Locations and tables are both independently manageable (add/edit/remove
// via server/db/reservations.ts, gated by the Reservation permission) - not
// a fixed catalog. `type` on each is a free-text category label only, same
// role as `division`/`category` elsewhere in this schema - no behavior is
// keyed off it.
export const reservationLocations = pgTable('reservation_locations', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  name: text('name').notNull(),
  type: text('type'),
}, (t) => [
  uniqueIndex('reservation_locations_name').on(t.name),
]);

// Every table is a single bookable unit - capacity is its real seat count,
// and (see reservations below) it holds at most one active reservation per
// overlapping time window. This is what makes the chef's table need no
// special-casing: it's just a table like any other.
//
// maxExtraCapacity is overflow seating the floor can squeeze onto the table
// when friends join an already-full party (see server/db/guestSignIns.ts's
// merge-onto-an-occupied-table flow). Default 0 - a table seats exactly its
// capacity unless someone deliberately raises this. Physically pushing whole
// tables together for a big party is a separate thing - see tableMerges below.
export const reservationTables = pgTable('reservation_tables', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  locationId: text('location_id').notNull().references(() => reservationLocations.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  type: text('type'),
  capacity: integer('capacity').notNull(),
  maxExtraCapacity: integer('max_extra_capacity').notNull().default(0),
}, (t) => [
  uniqueIndex('reservation_tables_location_name').on(t.locationId, t.name),
]);

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show',
]);

// A reservation occupies [date+time, date+time+durationMinutes) on its
// table. Date, time and durationMinutes are editable after creation via
// server/db/reservations.ts (extendReservation / rescheduleReservation /
// endReservationEarly) - the floor needs to stretch, shorten or move a
// booking as the evening runs, not just cancel and rebook. Every such edit
// is an UPDATE, and the 0021 EXCLUDE constraint below re-checks the overlap
// rule on UPDATE just as it does on INSERT, so there is no hand-rolled
// "re-check excluding myself" path to keep correct.
//
// Overlap safety has a DB-level backstop that Drizzle can't express and so
// lives in migration 0021: a partial `EXCLUDE USING gist` constraint
// (reservations_no_table_overlap) rejecting two active reservations whose
// time ranges intersect on the same table, plus CHECK constraints pinning
// date/time to their literal formats. The app-level check in
// createReservation runs first for a friendly message; the constraint is
// what makes it race-safe.
//
// seatedAt / departedAt are the *actual* arrival and departure stamps the
// floor view reads ("occupied since 19:05", freed early at 20:40) - distinct
// from the booked `time` and `durationMinutes`.
export const reservations = pgTable('reservations', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  tableId: text('table_id').notNull().references(() => reservationTables.id, { onDelete: 'restrict' }),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  time: text('time').notNull(), // 'HH:MM', 24h
  durationMinutes: integer('duration_minutes').notNull().default(90),
  partySize: integer('party_size').notNull(),
  guestName: text('guest_name').notNull(),
  guestPhone: text('guest_phone'),
  guestEmail: text('guest_email'),
  status: reservationStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  seatedAt: text('seated_at'),      // ISO-8601, set when the party is actually seated
  departedAt: text('departed_at'),  // ISO-8601, set by endReservationEarly / Free table
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
});

// ── Guest sign-in register (Sienna front-of-house) ────────────────────────
// The digital replacement for Sienna's handwritten arrivals book, managed in
// server/db/guestSignIns.ts and gated by the same `Reservation` permission
// as the booking book it sits beside. A sign-in is NOT a reservation: a
// walk-in or function guest has no booked window, no capacity ceiling of its
// own, and often no table yet. locationId / tableId / reservationId all reuse
// the reservations catalogue and all null out (never cascade-delete) if the
// referenced row goes away - a register entry is a historical record.
export const guestVisitTypeEnum = pgEnum('guest_visit_type', ['walk_in', 'event']);

export const guestSignIns = pgTable('guest_sign_ins', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  visitType: guestVisitTypeEnum('visit_type').notNull().default('walk_in'),
  guestName: text('guest_name').notNull(),
  guestPhone: text('guest_phone'),
  guestEmail: text('guest_email'),
  partySize: integer('party_size').notNull().default(1),
  purpose: text('purpose'),
  host: text('host'),
  locationId: text('location_id').references(() => reservationLocations.id, { onDelete: 'set null' }),
  tableId: text('table_id').references(() => reservationTables.id, { onDelete: 'set null' }),
  reservationId: text('reservation_id').references(() => reservations.id, { onDelete: 'set null' }),
  signedInAt: text('signed_in_at').notNull(),  // ISO-8601
  seatedAt: text('seated_at'),                 // ISO-8601, when a table was assigned
  expectedUntil: text('expected_until'),       // ISO-8601, editable turn-time projection
  signedOutAt: text('signed_out_at'),          // ISO-8601, null = still on premises
  notes: text('notes'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
});

// ── Ad-hoc table merges (Sienna front-of-house) ───────────────────────────
// Staff physically push tables together for a party too big for any single
// table (usually a function). A merge is created as part of seating that
// party from the guest register (server/db/tableMerges.ts) and auto-releases
// when they sign out / are freed. While `releasedAt IS NULL` the member
// tables act as one unit of `combinedCapacity` for seating; an independent
// booking on a member table is still allowed, but only outside the occupying
// party's turn window plus `bufferMinutes` (cleanup / reset time, set by
// staff). "At most one active merge per table" is enforced in tableMerges.ts.
export const tableMergeKindEnum = pgEnum('table_merge_kind', ['adjacent', 'end_to_end']);

export const tableMerges = pgTable('table_merges', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  mergeKind: tableMergeKindEnum('merge_kind').notNull(),
  combinedCapacity: integer('combined_capacity').notNull(),
  bufferMinutes: integer('buffer_minutes').notNull().default(30),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  releasedAt: text('released_at'), // ISO-8601, null = active
});

// One row per table in a merge (>= 2). Cascade on both sides: dropping the
// merge or a table tidies its membership.
export const tableMergeMembers = pgTable('table_merge_members', {
  mergeId: text('merge_id').notNull().references(() => tableMerges.id, { onDelete: 'cascade' }),
  tableId: text('table_id').notNull().references(() => reservationTables.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('table_merge_members_merge_table').on(t.mergeId, t.tableId),
]);
