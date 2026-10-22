// Reservation management: locations, areas and tables are independently
// manageable catalogs (not a fixed list, see server/db/schema.ts), and
// reservations book a specific table for a time window. A table holds at
// most one active reservation per overlapping window - that single rule
// (plus a party-size-vs-capacity check) is what gives every table real
// capacity enforcement, the chef's table included, with no special-casing.
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db, ready, schema } from './client.ts';
import { escapeLikeTerm } from '../db.ts';
import { toMinutes, fromMinutes, istNow, istDayBounds } from './reservationsTime.ts';
import { DEFAULT_AREAS, DEFAULT_LOCATION } from './reservationCatalog.ts';
import { activeMergeForTable, mergedGroup, releaseMergeForTable, mergeBlockWindow } from './tableMerges.ts';

// Re-exported for server/db/guestSignIns.ts, which imports the time helpers
// from here alongside the reservation query helpers below.
export { toMinutes, fromMinutes, istNow, istDayBounds };

export class ReservationError extends Error {}

/** A reservation_tables row plus its merge configuration: `freeMerge` (the
 *  column) and `mergeableWith` (the ids it is paired with in
 *  table_merge_links, both directions, sorted). What listTables / createTable /
 *  updateTable return. */
export interface TableView {
  id: string;
  createdDate: string;
  areaId: string;
  name: string;
  type: string | null;
  capacity: number;
  maxExtraCapacity: number;
  freeMerge: boolean;
  mergeableWith: string[];
  archivedAt: string | null;
  /** Ever booked or signed in: archive only, no permanent delete. */
  hasHistory: boolean;
}

/** Validate a proposed merge-target list for a table in `areaId`: dedupe,
 *  drop self, then require every id to exist and sit in the same area. Returns
 *  the cleaned id list. */
async function resolveMergeTargets(
  tableId: string, areaId: string, mergeableWith: string[],
): Promise<string[]> {
  const ids = [...new Set(mergeableWith)].filter((x) => x !== tableId);
  if (ids.length === 0) return [];
  const partners = await db.select().from(schema.reservationTables)
    .where(inArray(schema.reservationTables.id, ids));
  if (partners.length !== ids.length) throw new ReservationError('One or more merge targets no longer exist');
  if (partners.some((p) => p.archivedAt)) throw new ReservationError('Merge targets must not be archived');
  if (partners.some((p) => p.areaId !== areaId)) {
    throw new ReservationError('Merge targets must be in the same area as this table');
  }
  return ids;
}

/** Postgres raises 23P01 when the reservations_no_table_overlap EXCLUDE
 *  constraint (migration 0021) rejects a write - the DB-level backstop for the
 *  same-table/overlapping-window rule the checks below enforce first. A race
 *  that slips past those checks, or a status change into an already-booked
 *  slot, lands here; surface it as a normal 400 rather than a 500. */
function asReservationError(err: unknown): never {
  // drizzle wraps the driver error, so the SQLSTATE can be on err or err.cause.
  const code = (err as { code?: string })?.code
    ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === '23P01') {
    throw new ReservationError('That table is already booked for an overlapping time on this date');
  }
  throw err;
}

export const INACTIVE_STATUSES: readonly string[] = ['cancelled', 'no_show'];
const RESERVATION_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'] as const;
type ReservationStatus = typeof RESERVATION_STATUSES[number];

/** Active (not cancelled/no_show) reservations on `tableId` (one id, or a
 *  merged group of ids) / `date` whose [time, time+duration) window intersects
 *  [startMin, endMin), excluding `excludeId`. Shared by the extend/reschedule
 *  checks here and the walk-in-vs-booking clash check in
 *  server/db/guestSignIns.ts. */
export async function listActiveReservationOverlaps(
  { tableId, date, startMin, endMin, excludeId }:
  { tableId: string | string[]; date: string; startMin: number; endMin: number; excludeId?: string },
) {
  await ready();
  const ids = Array.isArray(tableId) ? tableId : [tableId];
  const rows = await db.select().from(schema.reservations)
    .where(and(inArray(schema.reservations.tableId, ids), eq(schema.reservations.date, date)));
  return rows
    .filter((r) => r.id !== excludeId
      && !INACTIVE_STATUSES.includes(r.status)
      && toMinutes(r.time) < endMin
      && toMinutes(r.time) + r.durationMinutes > startMin)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

/** Deterministic and code-only (the default venue and its area names, not
 *  real table data), so - like seedPermissionsCatalog - this is safe to call
 *  unconditionally from client.ts's ready(). Only seeds once: if any
 *  location already exists (including if the business has since renamed
 *  or deleted the defaults), it does nothing - this must never resurrect a
 *  location someone intentionally removed. Databases that predate the
 *  location level get their location from migration 0049 instead. */
export async function seedDefaultReservationLocations() {
  const existing = await db.select({ id: schema.reservationLocations.id }).from(schema.reservationLocations).limit(1);
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  const locationId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.reservationLocations).values({ id: locationId, createdDate: now, name: DEFAULT_LOCATION });
    await tx.insert(schema.reservationAreas).values(
      // One millisecond apart so creation order keeps the list order.
      DEFAULT_AREAS.map((a, i) => ({
        id: randomUUID(), createdDate: new Date(Date.parse(now) + i).toISOString(), locationId, name: a.name, floor: a.floor,
      })),
    );
  });
}

// ── Archiving ────────────────────────────────────────────────────────────
// Locations, areas and tables are never hard-deleted once they have history:
// "delete" archives them (archivedAt set), which hides them from lists and
// pickers and refuses new bookings, sign-ins and merges, while reservations and
// guest-register entries keep pointing at them and still show their names.

export type ArchivedFilter = 'exclude' | 'include' | 'only';

const archivedCondition = (column: AnyPgColumn, mode: ArchivedFilter) =>
  mode === 'exclude' ? isNull(column) : mode === 'only' ? isNotNull(column) : undefined;

/** What stops a set of tables being archived right now: bookings that are
 *  coming up or in progress (a pending/confirmed one counts until
 *  date+time+duration has passed, a seated one until someone completes it), a
 *  party still signed in at the table, or a live table merge. Returns the
 *  human-readable blockers, empty when the tables are free to go. */
async function upcomingBlockers(tableIds: string[], now: Date): Promise<string[]> {
  if (tableIds.length === 0) return [];
  const { date: today, minutes: nowMin } = istNow(now);
  const live = await db.select().from(schema.reservations).where(and(
    inArray(schema.reservations.tableId, tableIds),
    inArray(schema.reservations.status, ['pending', 'confirmed', 'seated']),
  ));
  // A pending/confirmed booking that already ended is not "upcoming"; a seated
  // one is, whatever its end, because the party is still there.
  const all = live
    .filter((r) => r.status === 'seated'
      || r.date > today
      || (r.date === today && toMinutes(r.time) + r.durationMinutes > nowMin))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const blockers: string[] = [];
  if (all.length > 0) {
    const next = all[0];
    blockers.push(`${all.length} upcoming reservation${all.length === 1 ? '' : 's'} (next: ${next.date} ${next.time}, ${next.guestName})`);
  }
  const [signedIn] = await db.select({ n: count() }).from(schema.guestSignIns).where(and(
    inArray(schema.guestSignIns.tableId, tableIds), isNull(schema.guestSignIns.signedOutAt),
  ));
  if (Number(signedIn.n) > 0) blockers.push('a party is signed in at it right now');
  const [merged] = await db.select({ n: count() }).from(schema.tableMergeMembers)
    .innerJoin(schema.tableMerges, eq(schema.tableMerges.id, schema.tableMergeMembers.mergeId))
    .where(and(inArray(schema.tableMergeMembers.tableId, tableIds), isNull(schema.tableMerges.releasedAt)));
  if (Number(merged.n) > 0) blockers.push('it is part of a live table merge');
  return blockers;
}

const blockedMessage = (kind: string, name: string, blockers: string[]) =>
  `Can't archive ${kind} ${name}: ${blockers.join('; ')}.`;

// ── Locations (venues) ───────────────────────────────────────────────────

export async function listLocations({ archived = 'exclude' }: { archived?: ArchivedFilter } = {}) {
  await ready();
  const rows = await db.select().from(schema.reservationLocations)
    .where(archivedCondition(schema.reservationLocations.archivedAt, archived))
    .orderBy(asc(schema.reservationLocations.name));
  const withAreas = new Set((await db.select({ id: schema.reservationAreas.locationId }).from(schema.reservationAreas)).map((a) => a.id));
  return rows.map((r) => ({ ...r, hasHistory: withAreas.has(r.id) }));
}

export async function createLocation({ name }: { name: string }) {
  await ready();
  const trimmed = name?.trim();
  if (!trimmed) throw new ReservationError('Location name is required');
  const [existing] = await db.select().from(schema.reservationLocations)
    .where(and(eq(schema.reservationLocations.name, trimmed), isNull(schema.reservationLocations.archivedAt)));
  if (existing) throw new ReservationError(`A location named "${trimmed}" already exists`);
  const [row] = await db.insert(schema.reservationLocations).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    name: trimmed,
  }).returning();
  return { ...row, hasHistory: false };
}

export async function updateLocation(id: string, { name }: { name?: string }) {
  await ready();
  const [existing] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
  if (!existing) throw new ReservationError(`No location with id ${id}`);
  if (existing.archivedAt) throw new ReservationError(`${existing.name} is archived - restore it before editing.`);

  const patch: { name?: string } = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new ReservationError('Location name is required');
    if (trimmed !== existing.name) {
      const [dupe] = await db.select().from(schema.reservationLocations)
        .where(and(eq(schema.reservationLocations.name, trimmed), isNull(schema.reservationLocations.archivedAt)));
      if (dupe) throw new ReservationError(`A location named "${trimmed}" already exists`);
    }
    patch.name = trimmed;
  }
  if (Object.keys(patch).length === 0) return existing;

  const [row] = await db.update(schema.reservationLocations).set(patch).where(eq(schema.reservationLocations.id, id)).returning();
  return row;
}

/** All table ids under a location (archived areas and tables included). */
async function tableIdsInLocation(locationId: string): Promise<string[]> {
  const rows = await db.select({ id: schema.reservationTables.id }).from(schema.reservationTables)
    .innerJoin(schema.reservationAreas, eq(schema.reservationAreas.id, schema.reservationTables.areaId))
    .where(eq(schema.reservationAreas.locationId, locationId));
  return rows.map((r) => r.id);
}

export async function archiveLocation(id: string, now = new Date()) {
  await ready();
  const [existing] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
  if (!existing) throw new ReservationError(`No location with id ${id}`);
  if (existing.archivedAt) throw new ReservationError(`${existing.name} is already archived.`);
  const [activeArea] = await db.select({ id: schema.reservationAreas.id }).from(schema.reservationAreas)
    .where(and(eq(schema.reservationAreas.locationId, id), isNull(schema.reservationAreas.archivedAt))).limit(1);
  if (activeArea) throw new ReservationError(`Archive ${existing.name}'s areas before archiving the location.`);
  const blockers = await upcomingBlockers(await tableIdsInLocation(id), now);
  if (blockers.length > 0) throw new ReservationError(blockedMessage('location', existing.name, blockers));
  await db.update(schema.reservationLocations).set({ archivedAt: now.toISOString() }).where(eq(schema.reservationLocations.id, id));
}

export async function restoreLocation(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
  if (!existing) throw new ReservationError(`No location with id ${id}`);
  if (!existing.archivedAt) throw new ReservationError(`${existing.name} is not archived.`);
  const [clash] = await db.select({ id: schema.reservationLocations.id }).from(schema.reservationLocations)
    .where(and(eq(schema.reservationLocations.name, existing.name), isNull(schema.reservationLocations.archivedAt)));
  if (clash) throw new ReservationError(`A location named "${existing.name}" already exists - rename that one first.`);
  await db.update(schema.reservationLocations).set({ archivedAt: null }).where(eq(schema.reservationLocations.id, id));
}

/** Permanent delete, only for a location that never had an area. */
export async function purgeLocation(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
  if (!existing) throw new ReservationError(`No location with id ${id}`);
  const [anyArea] = await db.select({ id: schema.reservationAreas.id }).from(schema.reservationAreas)
    .where(eq(schema.reservationAreas.locationId, id)).limit(1);
  if (anyArea) throw new ReservationError(`${existing.name} has areas on record (archived ones too) and can't be deleted permanently - archive it instead.`);
  await db.delete(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
}

// ── Areas (a room or zone inside a location, optionally on a named floor) ──

export async function listAreas({ locationId, archived = 'exclude' }: { locationId?: string; archived?: ArchivedFilter } = {}) {
  await ready();
  const conditions = [archivedCondition(schema.reservationAreas.archivedAt, archived)];
  if (locationId) conditions.push(eq(schema.reservationAreas.locationId, locationId));
  // Creation order is the display order (Cafe, Restaurant, Bar, Second Floor), name as the tie-break.
  const rows = await db.select().from(schema.reservationAreas).where(and(...conditions))
    .orderBy(asc(schema.reservationAreas.createdDate), asc(schema.reservationAreas.name));
  const used = new Set([
    ...(await db.select({ id: schema.reservationTables.areaId }).from(schema.reservationTables)).map((t) => t.id),
    ...(await db.select({ id: schema.guestSignIns.areaId }).from(schema.guestSignIns).where(isNotNull(schema.guestSignIns.areaId))).map((s) => s.id as string),
  ]);
  return rows.map((r) => ({ ...r, hasHistory: used.has(r.id) }));
}

export async function createArea(
  { locationId, name, floor, type }: { locationId: string; name: string; floor?: string | null; type?: string | null },
) {
  await ready();
  const [location] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, locationId));
  if (!location) throw new ReservationError(`No location with id ${locationId}`);
  if (location.archivedAt) throw new ReservationError(`${location.name} is archived - restore it before adding areas.`);
  const trimmed = name?.trim();
  if (!trimmed) throw new ReservationError('Area name is required');
  const [existing] = await db.select().from(schema.reservationAreas).where(and(
    eq(schema.reservationAreas.locationId, locationId), eq(schema.reservationAreas.name, trimmed), isNull(schema.reservationAreas.archivedAt),
  ));
  if (existing) throw new ReservationError(`${location.name} already has an area named "${trimmed}"`);
  const [row] = await db.insert(schema.reservationAreas).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    locationId,
    name: trimmed,
    floor: floor?.trim() || null,
    type: type?.trim() || null,
  }).returning();
  return { ...row, hasHistory: false };
}

export async function updateArea(
  id: string, { name, floor, type }: { name?: string; floor?: string | null; type?: string | null },
) {
  await ready();
  const [existing] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, id));
  if (!existing) throw new ReservationError(`No area with id ${id}`);
  if (existing.archivedAt) throw new ReservationError(`${existing.name} is archived - restore it before editing.`);

  const patch: { name?: string; floor?: string | null; type?: string | null } = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new ReservationError('Area name is required');
    if (trimmed !== existing.name) {
      const [dupe] = await db.select().from(schema.reservationAreas).where(and(
        eq(schema.reservationAreas.locationId, existing.locationId), eq(schema.reservationAreas.name, trimmed), isNull(schema.reservationAreas.archivedAt),
      ));
      if (dupe) throw new ReservationError(`This location already has an area named "${trimmed}"`);
    }
    patch.name = trimmed;
  }
  if (floor !== undefined) patch.floor = floor?.trim() || null;
  if (type !== undefined) patch.type = type?.trim() || null;
  if (Object.keys(patch).length === 0) return existing;

  const [row] = await db.update(schema.reservationAreas).set(patch).where(eq(schema.reservationAreas.id, id)).returning();
  return row;
}

export async function archiveArea(id: string, now = new Date()) {
  await ready();
  const [existing] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, id));
  if (!existing) throw new ReservationError(`No area with id ${id}`);
  if (existing.archivedAt) throw new ReservationError(`${existing.name} is already archived.`);
  const [activeTable] = await db.select({ id: schema.reservationTables.id }).from(schema.reservationTables)
    .where(and(eq(schema.reservationTables.areaId, id), isNull(schema.reservationTables.archivedAt))).limit(1);
  if (activeTable) throw new ReservationError(`Archive ${existing.name}'s tables before archiving the area.`);
  const tables = await db.select({ id: schema.reservationTables.id }).from(schema.reservationTables)
    .where(eq(schema.reservationTables.areaId, id));
  const blockers = await upcomingBlockers(tables.map((t) => t.id), now);
  if (blockers.length > 0) throw new ReservationError(blockedMessage('area', existing.name, blockers));
  await db.update(schema.reservationAreas).set({ archivedAt: now.toISOString() }).where(eq(schema.reservationAreas.id, id));
}

export async function restoreArea(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, id));
  if (!existing) throw new ReservationError(`No area with id ${id}`);
  if (!existing.archivedAt) throw new ReservationError(`${existing.name} is not archived.`);
  const [location] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, existing.locationId));
  if (location?.archivedAt) throw new ReservationError(`Restore ${location.name} first.`);
  const [clash] = await db.select({ id: schema.reservationAreas.id }).from(schema.reservationAreas).where(and(
    eq(schema.reservationAreas.locationId, existing.locationId), eq(schema.reservationAreas.name, existing.name), isNull(schema.reservationAreas.archivedAt),
  ));
  if (clash) throw new ReservationError(`This location already has an area named "${existing.name}" - rename that one first.`);
  await db.update(schema.reservationAreas).set({ archivedAt: null }).where(eq(schema.reservationAreas.id, id));
}

/** Permanent delete, only for an area that never had a table or a sign-in. */
export async function purgeArea(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, id));
  if (!existing) throw new ReservationError(`No area with id ${id}`);
  const [anyTable] = await db.select({ id: schema.reservationTables.id }).from(schema.reservationTables)
    .where(eq(schema.reservationTables.areaId, id)).limit(1);
  const [anySignIn] = await db.select({ id: schema.guestSignIns.id }).from(schema.guestSignIns)
    .where(eq(schema.guestSignIns.areaId, id)).limit(1);
  if (anyTable || anySignIn) {
    throw new ReservationError(`${existing.name} has tables or guest-register entries on record and can't be deleted permanently - archive it instead.`);
  }
  await db.delete(schema.reservationAreas).where(eq(schema.reservationAreas.id, id));
}

// ── Tables ───────────────────────────────────────────────────────────────

/** Map of table id -> the ids it can be merged with (both directions of every
 *  table_merge_links row), each list sorted. */
async function mergeLinksByTable(): Promise<Map<string, string[]>> {
  const links = await db.select().from(schema.tableMergeLinks);
  const map = new Map<string, string[]>();
  const add = (k: string, v: string) => {
    const cur = map.get(k);
    if (cur) cur.push(v); else map.set(k, [v]);
  };
  for (const l of links) { add(l.tableAId, l.tableBId); add(l.tableBId, l.tableAId); }
  for (const list of map.values()) list.sort();
  return map;
}

/** Merge targets for one table (both directions), sorted. */
async function mergeTargetsFor(id: string): Promise<string[]> {
  const rows = await db.select().from(schema.tableMergeLinks).where(or(
    eq(schema.tableMergeLinks.tableAId, id),
    eq(schema.tableMergeLinks.tableBId, id),
  ));
  return rows.map((r) => (r.tableAId === id ? r.tableBId : r.tableAId)).sort();
}

export async function listTables({ areaId, archived = 'exclude' }: { areaId?: string; archived?: ArchivedFilter } = {}): Promise<TableView[]> {
  await ready();
  const conditions = [archivedCondition(schema.reservationTables.archivedAt, archived)];
  if (areaId) conditions.push(eq(schema.reservationTables.areaId, areaId));
  // Natural order, so F2 comes before F10 and BAR 1 before BAR 12.
  const rows = (await db.select().from(schema.reservationTables).where(and(...conditions)))
    .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
  const links = await mergeLinksByTable();
  const used = new Set([
    ...(await db.select({ id: schema.reservations.tableId }).from(schema.reservations)).map((r) => r.id),
    ...(await db.select({ id: schema.guestSignIns.tableId }).from(schema.guestSignIns).where(isNotNull(schema.guestSignIns.tableId))).map((s) => s.id as string),
  ]);
  return rows.map((r) => ({ ...r, mergeableWith: links.get(r.id) ?? [], hasHistory: used.has(r.id) }));
}

export async function createTable(
  { areaId, name, type, capacity, maxExtraCapacity, freeMerge, mergeableWith }:
  { areaId: string; name: string; type?: string | null; capacity: number;
    maxExtraCapacity?: number; freeMerge?: boolean; mergeableWith?: string[] },
): Promise<TableView> {
  await ready();
  const [area] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, areaId));
  if (!area) throw new ReservationError(`No area with id ${areaId}`);
  if (area.archivedAt) throw new ReservationError(`${area.name} is archived - restore it before adding tables.`);
  const trimmed = name?.trim();
  if (!trimmed) throw new ReservationError('Table name is required');
  if (!Number.isInteger(capacity) || capacity <= 0) throw new ReservationError('Capacity must be a positive whole number');
  const extra = maxExtraCapacity ?? 0;
  if (!Number.isInteger(extra) || extra < 0) throw new ReservationError('Max extra capacity must be a whole number of 0 or more');
  const [dupe] = await db.select().from(schema.reservationTables).where(and(
    eq(schema.reservationTables.areaId, areaId), eq(schema.reservationTables.name, trimmed), isNull(schema.reservationTables.archivedAt),
  ));
  if (dupe) throw new ReservationError(`${area.name} already has a table named "${trimmed}"`);

  const id = randomUUID();
  const targetIds = await resolveMergeTargets(id, areaId, mergeableWith ?? []);

  await db.transaction(async (tx) => {
    await tx.insert(schema.reservationTables).values({
      id,
      createdDate: new Date().toISOString(),
      areaId,
      name: trimmed,
      type: type?.trim() || null,
      capacity,
      maxExtraCapacity: extra,
      freeMerge: freeMerge ?? false,
    });
    for (const partnerId of targetIds) {
      const [a, b] = [id, partnerId].sort();
      await tx.insert(schema.tableMergeLinks).values({ tableAId: a, tableBId: b });
    }
  });

  const [row] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  return { ...row, mergeableWith: [...targetIds].sort(), hasHistory: false };
}

export async function updateTable(
  id: string,
  { name, type, capacity, maxExtraCapacity, freeMerge, mergeableWith }:
  { name?: string; type?: string | null; capacity?: number; maxExtraCapacity?: number;
    freeMerge?: boolean; mergeableWith?: string[] },
): Promise<TableView> {
  await ready();
  const [existing] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  if (!existing) throw new ReservationError(`No table with id ${id}`);
  if (existing.archivedAt) throw new ReservationError(`${existing.name} is archived - restore it before editing.`);

  const patch: { name?: string; type?: string | null; capacity?: number; maxExtraCapacity?: number; freeMerge?: boolean } = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new ReservationError('Table name is required');
    if (trimmed !== existing.name) {
      const [dupe] = await db.select().from(schema.reservationTables).where(and(
        eq(schema.reservationTables.areaId, existing.areaId), eq(schema.reservationTables.name, trimmed), isNull(schema.reservationTables.archivedAt),
      ));
      if (dupe) throw new ReservationError(`This area already has a table named "${trimmed}"`);
    }
    patch.name = trimmed;
  }
  if (type !== undefined) patch.type = type?.trim() || null;
  if (capacity !== undefined) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new ReservationError('Capacity must be a positive whole number');
    patch.capacity = capacity;
  }
  if (maxExtraCapacity !== undefined) {
    if (!Number.isInteger(maxExtraCapacity) || maxExtraCapacity < 0) {
      throw new ReservationError('Max extra capacity must be a whole number of 0 or more');
    }
    patch.maxExtraCapacity = maxExtraCapacity;
  }
  if (freeMerge !== undefined) patch.freeMerge = !!freeMerge;

  const targetIds = mergeableWith === undefined
    ? null
    : await resolveMergeTargets(id, existing.areaId, mergeableWith);

  await db.transaction(async (tx) => {
    if (Object.keys(patch).length > 0) {
      await tx.update(schema.reservationTables).set(patch).where(eq(schema.reservationTables.id, id));
    }
    if (targetIds !== null) {
      await tx.delete(schema.tableMergeLinks).where(or(
        eq(schema.tableMergeLinks.tableAId, id),
        eq(schema.tableMergeLinks.tableBId, id),
      ));
      for (const partnerId of targetIds) {
        const [a, b] = [id, partnerId].sort();
        await tx.insert(schema.tableMergeLinks).values({ tableAId: a, tableBId: b });
      }
    }
  });

  const [row] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  return { ...row, mergeableWith: await mergeTargetsFor(id), hasHistory: await tableHasHistory(id) };
}

async function tableHasHistory(id: string): Promise<boolean> {
  const [booking] = await db.select({ id: schema.reservations.id }).from(schema.reservations)
    .where(eq(schema.reservations.tableId, id)).limit(1);
  const [signIn] = await db.select({ id: schema.guestSignIns.id }).from(schema.guestSignIns)
    .where(eq(schema.guestSignIns.tableId, id)).limit(1);
  return !!booking || !!signIn;
}

export async function archiveTable(id: string, now = new Date()) {
  await ready();
  const [existing] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  if (!existing) throw new ReservationError(`No table with id ${id}`);
  if (existing.archivedAt) throw new ReservationError(`${existing.name} is already archived.`);
  const blockers = await upcomingBlockers([id], now);
  if (blockers.length > 0) throw new ReservationError(blockedMessage('table', existing.name, blockers));
  await db.update(schema.reservationTables).set({ archivedAt: now.toISOString() }).where(eq(schema.reservationTables.id, id));
}

export async function restoreTable(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  if (!existing) throw new ReservationError(`No table with id ${id}`);
  if (!existing.archivedAt) throw new ReservationError(`${existing.name} is not archived.`);
  const [area] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, existing.areaId));
  if (area?.archivedAt) throw new ReservationError(`Restore ${area.name} first.`);
  const [clash] = await db.select({ id: schema.reservationTables.id }).from(schema.reservationTables).where(and(
    eq(schema.reservationTables.areaId, existing.areaId), eq(schema.reservationTables.name, existing.name), isNull(schema.reservationTables.archivedAt),
  ));
  if (clash) throw new ReservationError(`${area?.name ?? 'This area'} already has a table named "${existing.name}" - rename that one first.`);
  await db.update(schema.reservationTables).set({ archivedAt: null }).where(eq(schema.reservationTables.id, id));
}

/** Permanent delete, only for a table that never had a booking or sign-in. */
export async function purgeTable(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  if (!existing) throw new ReservationError(`No table with id ${id}`);
  if (await tableHasHistory(id)) {
    throw new ReservationError(`${existing.name} has reservations or guest-register entries on record and can't be deleted permanently - archive it instead.`);
  }
  await db.delete(schema.reservationTables).where(eq(schema.reservationTables.id, id));
}

// ── Reservations ─────────────────────────────────────────────────────────

// The joined row every reservation list returns (booking + table + area +
// location names), shared so the day view and the paged list cannot drift.
const reservationColumns = {
  id: schema.reservations.id,
  createdDate: schema.reservations.createdDate,
  tableId: schema.reservations.tableId,
  tableName: schema.reservationTables.name,
  tableCapacity: schema.reservationTables.capacity,
  areaId: schema.reservationTables.areaId,
  areaName: schema.reservationAreas.name,
  floor: schema.reservationAreas.floor,
  locationName: schema.reservationLocations.name,
  date: schema.reservations.date,
  time: schema.reservations.time,
  durationMinutes: schema.reservations.durationMinutes,
  partySize: schema.reservations.partySize,
  guestName: schema.reservations.guestName,
  guestPhone: schema.reservations.guestPhone,
  guestEmail: schema.reservations.guestEmail,
  status: schema.reservations.status,
  notes: schema.reservations.notes,
  seatedAt: schema.reservations.seatedAt,
  departedAt: schema.reservations.departedAt,
  tableMaxExtraCapacity: schema.reservationTables.maxExtraCapacity,
};

const selectReservations = () => db
  .select(reservationColumns)
  .from(schema.reservations)
  .innerJoin(schema.reservationTables, eq(schema.reservationTables.id, schema.reservations.tableId))
  .innerJoin(schema.reservationAreas, eq(schema.reservationAreas.id, schema.reservationTables.areaId))
  .innerJoin(schema.reservationLocations, eq(schema.reservationLocations.id, schema.reservationAreas.locationId))
  .$dynamic();

export async function listReservations({ date, tableId, areaId }: { date?: string; tableId?: string; areaId?: string } = {}) {
  await ready();
  let query = selectReservations();

  const conditions = [];
  if (date) conditions.push(eq(schema.reservations.date, date));
  if (tableId) conditions.push(eq(schema.reservations.tableId, tableId));
  if (areaId) conditions.push(eq(schema.reservationTables.areaId, areaId));
  if (conditions.length > 0) query = query.where(and(...conditions));

  return query.orderBy(asc(schema.reservations.date), asc(schema.reservations.time));
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export interface ReservationPageFilter {
  from?: string;
  to?: string;
  status?: string;
  areaId?: string;
  /** Matches guest name, phone or email, case-insensitively. */
  q?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

/** One page of reservations across all days, for the "All" list. Filters are
 *  optional and combine with AND; `from`/`to` are inclusive. Ties on
 *  date+time fall back to id so a page boundary never repeats or drops a row. */
export async function listReservationPage(f: ReservationPageFilter = {}) {
  await ready();
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (f.from && !isDate(f.from)) throw new ReservationError('From date must be in YYYY-MM-DD format');
  if (f.to && !isDate(f.to)) throw new ReservationError('To date must be in YYYY-MM-DD format');
  if (f.status && !(RESERVATION_STATUSES as readonly string[]).includes(f.status)) throw new ReservationError(`Unknown status "${f.status}"`);
  if (f.order && f.order !== 'asc' && f.order !== 'desc') throw new ReservationError('Order must be asc or desc');
  const limit = Math.min(Math.max(Math.trunc(f.limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(Math.trunc(f.offset ?? 0) || 0, 0);

  const conditions = [];
  if (f.from) conditions.push(gte(schema.reservations.date, f.from));
  if (f.to) conditions.push(lte(schema.reservations.date, f.to));
  if (f.status) conditions.push(eq(schema.reservations.status, f.status as ReservationStatus));
  if (f.areaId) conditions.push(eq(schema.reservationTables.areaId, f.areaId));
  const q = f.q?.trim();
  if (q) {
    const term = `%${escapeLikeTerm(q)}%`;
    conditions.push(or(ilike(schema.reservations.guestName, term), ilike(schema.reservations.guestPhone, term), ilike(schema.reservations.guestEmail, term)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const dir = f.order === 'desc' ? desc : asc;
  const rows = await selectReservations()
    .where(where)
    .orderBy(dir(schema.reservations.date), dir(schema.reservations.time), asc(schema.reservations.id))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.reservations)
    .innerJoin(schema.reservationTables, eq(schema.reservationTables.id, schema.reservations.tableId))
    .where(where);

  return { rows, total: Number(total) };
}

/** Spotlight search over reservations, by guest name/phone/email - most
 *  recent bookings first, unlike listReservations' chronological order,
 *  since a recent guest is the more likely match. */
export async function searchReservations(q: string, limit: number) {
  await ready();
  const term = `%${escapeLikeTerm(q)}%`;
  return db
    .select({
      id: schema.reservations.id,
      guestName: schema.reservations.guestName,
      date: schema.reservations.date,
      time: schema.reservations.time,
      partySize: schema.reservations.partySize,
    })
    .from(schema.reservations)
    .where(or(ilike(schema.reservations.guestName, term), ilike(schema.reservations.guestPhone, term), ilike(schema.reservations.guestEmail, term)))
    .orderBy(desc(schema.reservations.date), desc(schema.reservations.time))
    .limit(limit);
}

export async function createReservation(
  userId: number,
  { tableId, date, time, durationMinutes, partySize, guestName, guestPhone, guestEmail, notes }:
  { tableId: string; date: string; time: string; durationMinutes?: number; partySize: number; guestName: string; guestPhone?: string; guestEmail?: string; notes?: string },
) {
  await ready();
  const [table] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, tableId));
  if (!table) throw new ReservationError(`No table with id ${tableId}`);
  if (table.archivedAt) throw new ReservationError(`${table.name} is archived and can't take new bookings`);

  if (!Number.isInteger(partySize) || partySize <= 0) throw new ReservationError('Party size must be a positive whole number');
  if (partySize > table.capacity) throw new ReservationError(`${table.name} seats up to ${table.capacity} - a party of ${partySize} won't fit`);
  if (!guestName?.trim()) throw new ReservationError('Guest name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new ReservationError('Date must be in YYYY-MM-DD format');
  if (!/^\d{2}:\d{2}$/.test(time ?? '')) throw new ReservationError('Time must be in HH:MM format');

  const duration = durationMinutes ?? 90;
  if (!Number.isInteger(duration) || duration <= 0) throw new ReservationError('Duration must be a positive whole number of minutes');
  const start = toMinutes(time);
  const end = start + duration;
  if (end > 24 * 60) throw new ReservationError("Reservations can't run past midnight - use a shorter duration or an earlier time");

  const sameDay = await db.select().from(schema.reservations)
    .where(and(eq(schema.reservations.tableId, tableId), eq(schema.reservations.date, date)));
  for (const existing of sameDay) {
    if (INACTIVE_STATUSES.includes(existing.status)) continue;
    const existingStart = toMinutes(existing.time);
    const existingEnd = existingStart + existing.durationMinutes;
    if (existingStart < end && existingEnd > start) {
      throw new ReservationError(`${table.name} is already booked ${existing.time}–${fromMinutes(existingEnd)} (${existing.guestName})`);
    }
  }

  // A table physically merged with others right now can still take a booking,
  // but not one overlapping the merged party's turn + reset buffer.
  const merge = await activeMergeForTable(tableId);
  if (merge) {
    const blocked = await mergeBlockWindow(merge, date);
    if (blocked && start < blocked.endMin && end > blocked.startMin) {
      const others = merge.tableNames.filter((n) => n !== table.name).join(' + ') || 'another table';
      throw new ReservationError(
        `${table.name} is merged with ${others} until about ${fromMinutes(blocked.endMin)} (includes a ${merge.bufferMinutes}-min reset) - book a later slot or a different table`,
      );
    }
  }

  const [row] = await db.insert(schema.reservations).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    tableId,
    date,
    time,
    durationMinutes: duration,
    partySize,
    guestName: guestName.trim(),
    guestPhone: guestPhone?.trim() || null,
    guestEmail: guestEmail?.trim() || null,
    status: 'pending',
    notes: notes?.trim() || null,
    createdByUserId: userId,
  }).returning().catch(asReservationError);
  return row;
}

export async function updateReservationStatus(id: string, status: string) {
  await ready();
  if (!RESERVATION_STATUSES.includes(status as ReservationStatus)) {
    throw new ReservationError(`Invalid status: ${status}`);
  }
  const [existing] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id));
  if (!existing) throw new ReservationError(`No reservation with id ${id}`);

  // Keep the floor-view timestamps in step with the lifecycle no matter where
  // the transition came from (this screen, or a linked guest sign-in).
  const patch: { status: ReservationStatus; seatedAt?: string; departedAt?: string } = {
    status: status as ReservationStatus,
  };
  const now = new Date().toISOString();
  if (status === 'seated' && !existing.seatedAt) patch.seatedAt = now;
  if (status === 'completed' && !existing.departedAt) patch.departedAt = now;

  const [row] = await db.update(schema.reservations).set(patch)
    .where(eq(schema.reservations.id, id)).returning().catch(asReservationError);
  // A booking that has ended (or was killed) no longer holds its merge, if any.
  if (['completed', 'cancelled', 'no_show'].includes(status)) {
    await releaseMergeForTable(existing.tableId);
  }
  return row;
}

/** Turn every pending/confirmed booking whose time + duration has passed into
 *  a no-show. A seated booking is never touched (the party is there). Bookings
 *  can't run past midnight, so "ended" is: an earlier date, or today with
 *  start + duration <= the current IST minute. The status guard is part of the
 *  UPDATE, so a booking staff seat between the read and the write is left
 *  alone. Releases any table merge the booking held, like a manual no-show.
 *  Returns the rows it changed (the caller pushes them to Calendar). */
export async function markExpiredReservationsNoShow(now = new Date()) {
  await ready();
  const { date: today, minutes: nowMin } = istNow(now);
  const candidates = await db.select().from(schema.reservations).where(and(
    inArray(schema.reservations.status, ['pending', 'confirmed']),
    lte(schema.reservations.date, today),
  ));
  const expired = candidates.filter((r) => r.date < today || toMinutes(r.time) + r.durationMinutes <= nowMin);
  const changed: (typeof schema.reservations.$inferSelect)[] = [];
  for (const r of expired) {
    const [row] = await db.update(schema.reservations).set({ status: 'no_show' }).where(and(
      eq(schema.reservations.id, r.id), inArray(schema.reservations.status, ['pending', 'confirmed']),
    )).returning();
    if (!row) continue;
    await releaseMergeForTable(row.tableId);
    changed.push(row);
  }
  return changed;
}

/** Stretch a booking's duration. Rejected (friendly message first, then the
 *  0021 EXCLUDE constraint as backstop) if the longer window runs into the
 *  next active booking on the table or past midnight. */
export async function extendReservation(id: string, { durationMinutes }: { durationMinutes: number }) {
  await ready();
  const [existing] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id));
  if (!existing) throw new ReservationError(`No reservation with id ${id}`);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new ReservationError('Duration must be a positive whole number of minutes');
  }
  if (durationMinutes <= existing.durationMinutes) {
    throw new ReservationError('Extend must lengthen the booking - use Free table to end it early');
  }
  const start = toMinutes(existing.time);
  if (start + durationMinutes > 24 * 60) {
    throw new ReservationError("A booking can't run past midnight - end earlier instead");
  }
  const [clash] = await listActiveReservationOverlaps({
    tableId: await mergedGroup(existing.tableId), date: existing.date, startMin: start, endMin: start + durationMinutes, excludeId: id,
  });
  if (clash) throw new ReservationError(`The next booking on this table starts at ${clash.time} (${clash.guestName})`);

  const [row] = await db.update(schema.reservations).set({ durationMinutes })
    .where(eq(schema.reservations.id, id)).returning().catch(asReservationError);
  return row;
}

/** Move a booking to a new date/time/duration (any subset). Same validation as
 *  createReservation; the EXCLUDE constraint backstops the overlap rule. */
export async function rescheduleReservation(
  id: string,
  { date, time, durationMinutes }: { date?: string; time?: string; durationMinutes?: number },
) {
  await ready();
  const [existing] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id));
  if (!existing) throw new ReservationError(`No reservation with id ${id}`);
  const [table] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, existing.tableId));
  if (table?.archivedAt) throw new ReservationError(`${table.name} is archived - this booking can't be moved`);

  const nextDate = date ?? existing.date;
  const nextTime = time ?? existing.time;
  const nextDuration = durationMinutes ?? existing.durationMinutes;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) throw new ReservationError('Date must be in YYYY-MM-DD format');
  if (!/^\d{2}:\d{2}$/.test(nextTime)) throw new ReservationError('Time must be in HH:MM format');
  if (!Number.isInteger(nextDuration) || nextDuration <= 0) {
    throw new ReservationError('Duration must be a positive whole number of minutes');
  }
  const start = toMinutes(nextTime);
  if (start + nextDuration > 24 * 60) {
    throw new ReservationError("A booking can't run past midnight - use a shorter duration or an earlier time");
  }
  const [clash] = await listActiveReservationOverlaps({
    tableId: await mergedGroup(existing.tableId), date: nextDate, startMin: start, endMin: start + nextDuration, excludeId: id,
  });
  if (clash) {
    throw new ReservationError(`${table?.name ?? 'That table'} is already booked ${clash.time}–${fromMinutes(toMinutes(clash.time) + clash.durationMinutes)} (${clash.guestName})`);
  }

  const [row] = await db.update(schema.reservations)
    .set({ date: nextDate, time: nextTime, durationMinutes: nextDuration })
    .where(eq(schema.reservations.id, id)).returning().catch(asReservationError);
  return row;
}

/** "Free table" for a booking: mark it done now and hand the rest of the slot
 *  back. Shrinking the window can never violate the overlap constraint. A
 *  no-op for an already-closed booking. */
export async function endReservationEarly(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id));
  if (!existing) throw new ReservationError(`No reservation with id ${id}`);
  if (['completed', 'cancelled', 'no_show'].includes(existing.status)) return existing;

  const now = new Date();
  const patch: { status: ReservationStatus; departedAt: string; durationMinutes?: number } = {
    status: 'completed',
    departedAt: now.toISOString(),
  };
  const { date: today, minutes: nowMin } = istNow(now);
  if (existing.date === today) {
    const elapsed = nowMin - toMinutes(existing.time);
    if (elapsed >= 1 && elapsed < existing.durationMinutes) patch.durationMinutes = elapsed;
  }
  const [row] = await db.update(schema.reservations).set(patch)
    .where(eq(schema.reservations.id, id)).returning();
  await releaseMergeForTable(existing.tableId);
  return row;
}

export async function deleteReservation(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id));
  if (!existing) throw new ReservationError(`No reservation with id ${id}`);
  await db.delete(schema.reservations).where(eq(schema.reservations.id, id));
  await releaseMergeForTable(existing.tableId);
  return existing;
}
