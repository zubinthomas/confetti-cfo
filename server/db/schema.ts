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
  address: text('address'),
  notes: text('notes'),
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
}, (t) => [
  uniqueIndex('payroll_records_employee_month').on(t.employeeId, t.month),
]);

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
export const reservationTables = pgTable('reservation_tables', {
  id: text('id').primaryKey(),
  createdDate: text('created_date').notNull(),
  locationId: text('location_id').notNull().references(() => reservationLocations.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  type: text('type'),
  capacity: integer('capacity').notNull(),
}, (t) => [
  uniqueIndex('reservation_tables_location_name').on(t.locationId, t.name),
]);

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show',
]);

// A reservation occupies [date+time, date+time+durationMinutes) on its
// table. Editing time/size after creation isn't supported - cancel and
// rebook instead (see server/db/reservations.ts) - only status transitions
// are, so there's no "re-check the conflict, excluding myself" path to
// maintain.
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
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
});
