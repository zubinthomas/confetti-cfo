// Reservation management: locations and tables are both independently
// manageable catalogs (not a fixed list, see server/db/schema.ts), and
// reservations book a specific table for a time window. A table holds at
// most one active reservation per overlapping window - that single rule
// (plus a party-size-vs-capacity check) is what gives every table real
// capacity enforcement, the chef's table included, with no special-casing.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { toMinutes, fromMinutes, istNow, istDayBounds } from './reservationsTime.ts';
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
  locationId: string;
  name: string;
  type: string | null;
  capacity: number;
  maxExtraCapacity: number;
  freeMerge: boolean;
  mergeableWith: string[];
}

/** Validate a proposed merge-target list for a table in `locationId`: dedupe,
 *  drop self, then require every id to exist and sit in the same area. Returns
 *  the cleaned id list. */
async function resolveMergeTargets(
  tableId: string, locationId: string, mergeableWith: string[],
): Promise<string[]> {
  const ids = [...new Set(mergeableWith)].filter((x) => x !== tableId);
  if (ids.length === 0) return [];
  const partners = await db.select().from(schema.reservationTables)
    .where(inArray(schema.reservationTables.id, ids));
  if (partners.length !== ids.length) throw new ReservationError('One or more merge targets no longer exist');
  if (partners.some((p) => p.locationId !== locationId)) {
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

/** Deterministic and code-only (the two location names, not real table
 *  data), so - like seedPermissionsCatalog - this is safe to call
 *  unconditionally from client.ts's ready(). Only seeds once: if any
 *  location already exists (including if the business has since renamed
 *  or deleted "Cafe"/"Restaurant"), it does nothing - this must never
 *  resurrect a location someone intentionally removed. */
export async function seedDefaultReservationLocations() {
  const existing = await db.select({ id: schema.reservationLocations.id }).from(schema.reservationLocations).limit(1);
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  await db.insert(schema.reservationLocations).values([
    { id: randomUUID(), createdDate: now, name: 'Cafe', type: null },
    { id: randomUUID(), createdDate: now, name: 'Restaurant', type: null },
  ]);
}

// ── Locations ────────────────────────────────────────────────────────────

export async function listLocations() {
  await ready();
  return db.select().from(schema.reservationLocations).orderBy(asc(schema.reservationLocations.name));
}

export async function createLocation({ name, type }: { name: string; type?: string | null }) {
  await ready();
  const trimmed = name?.trim();
  if (!trimmed) throw new ReservationError('Location name is required');
  const [existing] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.name, trimmed));
  if (existing) throw new ReservationError(`A location named "${trimmed}" already exists`);
  const [row] = await db.insert(schema.reservationLocations).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    name: trimmed,
    type: type?.trim() || null,
  }).returning();
  return row;
}

export async function updateLocation(id: string, { name, type }: { name?: string; type?: string | null }) {
  await ready();
  const [existing] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
  if (!existing) throw new ReservationError(`No location with id ${id}`);

  const patch: { name?: string; type?: string | null } = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new ReservationError('Location name is required');
    if (trimmed !== existing.name) {
      const [dupe] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.name, trimmed));
      if (dupe) throw new ReservationError(`A location named "${trimmed}" already exists`);
    }
    patch.name = trimmed;
  }
  if (type !== undefined) patch.type = type?.trim() || null;

  const [row] = await db.update(schema.reservationLocations).set(patch).where(eq(schema.reservationLocations.id, id)).returning();
  return row;
}

export async function deleteLocation(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
  if (!existing) throw new ReservationError(`No location with id ${id}`);
  const [anyTable] = await db.select({ id: schema.reservationTables.id }).from(schema.reservationTables)
    .where(eq(schema.reservationTables.locationId, id)).limit(1);
  if (anyTable) throw new ReservationError(`Remove ${existing.name}'s tables before deleting the location.`);
  await db.delete(schema.reservationLocations).where(eq(schema.reservationLocations.id, id));
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

export async function listTables({ locationId }: { locationId?: string } = {}): Promise<TableView[]> {
  await ready();
  let query = db.select().from(schema.reservationTables).$dynamic();
  if (locationId) query = query.where(eq(schema.reservationTables.locationId, locationId));
  const rows = await query.orderBy(asc(schema.reservationTables.name));
  const links = await mergeLinksByTable();
  return rows.map((r) => ({ ...r, mergeableWith: links.get(r.id) ?? [] }));
}

export async function createTable(
  { locationId, name, type, capacity, maxExtraCapacity, freeMerge, mergeableWith }:
  { locationId: string; name: string; type?: string | null; capacity: number;
    maxExtraCapacity?: number; freeMerge?: boolean; mergeableWith?: string[] },
): Promise<TableView> {
  await ready();
  const [location] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, locationId));
  if (!location) throw new ReservationError(`No location with id ${locationId}`);
  const trimmed = name?.trim();
  if (!trimmed) throw new ReservationError('Table name is required');
  if (!Number.isInteger(capacity) || capacity <= 0) throw new ReservationError('Capacity must be a positive whole number');
  const extra = maxExtraCapacity ?? 0;
  if (!Number.isInteger(extra) || extra < 0) throw new ReservationError('Max extra capacity must be a whole number of 0 or more');
  const [dupe] = await db.select().from(schema.reservationTables)
    .where(and(eq(schema.reservationTables.locationId, locationId), eq(schema.reservationTables.name, trimmed)));
  if (dupe) throw new ReservationError(`${location.name} already has a table named "${trimmed}"`);

  const id = randomUUID();
  const targetIds = await resolveMergeTargets(id, locationId, mergeableWith ?? []);

  await db.transaction(async (tx) => {
    await tx.insert(schema.reservationTables).values({
      id,
      createdDate: new Date().toISOString(),
      locationId,
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
  return { ...row, mergeableWith: [...targetIds].sort() };
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

  const patch: { name?: string; type?: string | null; capacity?: number; maxExtraCapacity?: number; freeMerge?: boolean } = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new ReservationError('Table name is required');
    if (trimmed !== existing.name) {
      const [dupe] = await db.select().from(schema.reservationTables)
        .where(and(eq(schema.reservationTables.locationId, existing.locationId), eq(schema.reservationTables.name, trimmed)));
      if (dupe) throw new ReservationError(`This location already has a table named "${trimmed}"`);
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
    : await resolveMergeTargets(id, existing.locationId, mergeableWith);

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
  return { ...row, mergeableWith: await mergeTargetsFor(id) };
}

export async function deleteTable(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  if (!existing) throw new ReservationError(`No table with id ${id}`);
  const [anyReservation] = await db.select({ id: schema.reservations.id }).from(schema.reservations)
    .where(eq(schema.reservations.tableId, id)).limit(1);
  if (anyReservation) throw new ReservationError(`${existing.name} has reservations on record and can't be deleted.`);
  await db.delete(schema.reservationTables).where(eq(schema.reservationTables.id, id));
}

// ── Reservations ─────────────────────────────────────────────────────────

export async function listReservations({ date, tableId, locationId }: { date?: string; tableId?: string; locationId?: string } = {}) {
  await ready();
  let query = db
    .select({
      id: schema.reservations.id,
      createdDate: schema.reservations.createdDate,
      tableId: schema.reservations.tableId,
      tableName: schema.reservationTables.name,
      tableCapacity: schema.reservationTables.capacity,
      locationId: schema.reservationTables.locationId,
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
    })
    .from(schema.reservations)
    .innerJoin(schema.reservationTables, eq(schema.reservationTables.id, schema.reservations.tableId))
    .innerJoin(schema.reservationLocations, eq(schema.reservationLocations.id, schema.reservationTables.locationId))
    .$dynamic();

  const conditions = [];
  if (date) conditions.push(eq(schema.reservations.date, date));
  if (tableId) conditions.push(eq(schema.reservations.tableId, tableId));
  if (locationId) conditions.push(eq(schema.reservationTables.locationId, locationId));
  if (conditions.length > 0) query = query.where(and(...conditions));

  return query.orderBy(asc(schema.reservations.date), asc(schema.reservations.time));
}

export async function createReservation(
  userId: number,
  { tableId, date, time, durationMinutes, partySize, guestName, guestPhone, guestEmail, notes }:
  { tableId: string; date: string; time: string; durationMinutes?: number; partySize: number; guestName: string; guestPhone?: string; guestEmail?: string; notes?: string },
) {
  await ready();
  const [table] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, tableId));
  if (!table) throw new ReservationError(`No table with id ${tableId}`);

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
}
