// Entity CRUD on the database (Drizzle). The API contract is unchanged from
// the old JSON-file store: rows go in/out with snake_case field names and a
// string id + ISO-8601 created_date.
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import { db, ready, schema } from './db/client.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyPgTable = PgTableWithColumns<any>;

const TABLES: Record<string, AnyPgTable> = {
  Employee: schema.employees,
  Licence: schema.licences,
  Recruitment: schema.recruitments,
  LeaveRequest: schema.leaveRequests,
  PayrollRecord: schema.payrollRecords,
  // Offboarding records - created via POST /api/employees/:id/offboard
  // (server/routes/entities.ts) for the atomic status-flip side effect, but
  // otherwise listed/edited/deleted like any other generic entity.
  EmployeeExit: schema.employeeExits,
  // The item catalog only - inventory_transactions is append-only and
  // needs an atomic side effect (adjusting the item's cached balance), so
  // it's served by server/routes/inventory.ts instead, not this generic
  // layer. Both share the Inventory permission resource.
  Inventory: schema.inventoryItems,
};

function assertEntity(entity: string): AnyPgTable {
  const table = TABLES[entity];
  if (!table) throw new Error(`Unknown entity: ${entity}`);
  return table;
}

// snake_case (API) <-> schema property (camelCase) maps per table
function fieldMaps(table: AnyPgTable) {
  const toProp: Record<string, string> = {};
  const toApi: Record<string, string> = {};
  for (const [prop, col] of Object.entries(getTableColumns(table))) {
    toProp[(col as { name: string }).name] = prop;
    toApi[prop] = (col as { name: string }).name;
  }
  return { toProp, toApi };
}

function toRow(table: AnyPgTable, data: Record<string, unknown>) {
  const { toProp } = fieldMaps(table);
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const prop = toProp[k];
    if (prop) row[prop] = v;
  }
  return row;
}

function toApiShape(table: AnyPgTable, row: Record<string, unknown>) {
  const { toApi } = fieldMaps(table);
  const out: Record<string, unknown> = {};
  for (const [prop, v] of Object.entries(row)) out[toApi[prop] ?? prop] = v;
  return out;
}

// Which column identifies "this row belongs to employee X", per entity -
// used by managedIds filtering below. Employee rows are keyed by their own
// id; PayrollRecord rows point at one via employeeId. Absent from this map
// (or absent from the table) = not reachable by manager-scoping, a no-op
// like the division-scope column-existence check just above it.
const MANAGER_SCOPE_COLUMN: Record<string, string> = {
  Employee: 'id',
  PayrollRecord: 'employeeId',
};

/** `divisionScope` and `managedIds`, each independently and when non-empty,
 *  restrict results to matching rows - both are no-ops for a table/entity
 *  they don't apply to, so both stay safe to pass for any entity. When both
 *  apply at once, results must satisfy both (AND), not either. See
 *  server/db/divisionScope.ts and server/db/managerScope.ts for where each
 *  scope itself comes from. */
export async function listEntities(entity: string, sort?: string, divisionScope?: string[], managedIds?: string[]) {
  const table = assertEntity(entity);
  await ready();
  let query = db.select().from(table).$dynamic();
  const conditions = [];
  const divisionCol = getTableColumns(table).division as unknown;
  if (divisionScope && divisionScope.length > 0 && divisionCol) {
    conditions.push(inArray(divisionCol as never, divisionScope));
  }
  const managerColName = MANAGER_SCOPE_COLUMN[entity];
  const managerCol = managerColName ? (getTableColumns(table)[managerColName] as unknown) : undefined;
  if (managedIds && managedIds.length > 0 && managerCol) {
    conditions.push(inArray(managerCol as never, managedIds));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  if (sort) {
    const isDesc = sort.startsWith('-');
    const apiField = isDesc ? sort.slice(1) : sort;
    const prop = fieldMaps(table).toProp[apiField];
    if (prop) {
      const col = getTableColumns(table)[prop] as never;
      query = query.orderBy(isDesc ? desc(col) : asc(col));
    }
  }
  const rows = await query;
  return rows.map((r) => toApiShape(table, r as Record<string, unknown>));
}

/** Single-row fetch by id, in API (snake_case) shape - used to check a
 *  row's current division before allowing a scoped update/delete. */
export async function getEntityRow(entity: string, id: string) {
  const table = assertEntity(entity);
  await ready();
  const [row] = await db.select().from(table).where(eq(table.id, id));
  return row ? toApiShape(table, row as Record<string, unknown>) : null;
}

export async function createEntity(entity: string, data: Record<string, unknown>) {
  const table = assertEntity(entity);
  await ready();
  const row = {
    ...toRow(table, data),
    id: randomUUID(),
    createdDate: new Date().toISOString(),
  };
  const [inserted] = await db.insert(table).values(row).returning();
  return toApiShape(table, inserted as Record<string, unknown>);
}

export async function updateEntity(entity: string, id: string, data: Record<string, unknown>) {
  const table = assertEntity(entity);
  await ready();
  const row = toRow(table, data);
  delete row.id;
  delete row.createdDate;
  const [updated] = await db.update(table).set(row).where(eq(table.id, id)).returning();
  return updated ? toApiShape(table, updated as Record<string, unknown>) : null;
}

/** Snake-case API payload -> camelCase row, for the few atomic
 *  multi-table operations (recruitment hire, employee offboard) that need
 *  to run their own db.transaction directly against schema tables instead
 *  of going through createEntity/updateEntity - kept in sync with the
 *  generic entity field mapping above instead of duplicating it. */
export function mapEntityInput(entity: string, data: Record<string, unknown>) {
  return toRow(assertEntity(entity), data);
}

/** The output-side counterpart of mapEntityInput - camelCase row -> the
 *  snake_case shape the API contract uses everywhere else. */
export function mapEntityOutput(entity: string, row: Record<string, unknown>) {
  return toApiShape(assertEntity(entity), row);
}

export async function deleteEntity(entity: string, id: string) {
  const table = assertEntity(entity);
  await ready();
  const deleted = await db.delete(table).where(eq(table.id, id)).returning();
  return deleted.length > 0;
}
