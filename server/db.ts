// Entity CRUD on the database (Drizzle). The API contract is unchanged from
// the old JSON-file store: rows go in/out with snake_case field names and a
// string id + ISO-8601 created_date.
import { randomUUID } from 'node:crypto';
import { asc, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import { db, ready, schema } from './db/client.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyPgTable = PgTableWithColumns<any>;

const TABLES: Record<string, AnyPgTable> = {
  Employee: schema.employees,
  Licence: schema.licences,
  Recruitment: schema.recruitments,
  LeaveRequest: schema.leaveRequests,
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

/** `divisionScope`, when non-empty, restricts results to rows whose
 *  `division` column is in the list - a no-op if the table has no
 *  `division` column, so this stays safe to pass for any entity. See
 *  server/db/divisionScope.ts for where the scope itself comes from. */
export async function listEntities(entity: string, sort?: string, divisionScope?: string[]) {
  const table = assertEntity(entity);
  await ready();
  let query = db.select().from(table).$dynamic();
  const divisionCol = getTableColumns(table).division as unknown;
  if (divisionScope && divisionScope.length > 0 && divisionCol) {
    query = query.where(inArray(divisionCol as never, divisionScope));
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

export async function deleteEntity(entity: string, id: string) {
  const table = assertEntity(entity);
  await ready();
  const deleted = await db.delete(table).where(eq(table.id, id)).returning();
  return deleted.length > 0;
}
