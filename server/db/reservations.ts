// Reservation management: locations and tables are both independently
// manageable catalogs (not a fixed list, see server/db/schema.ts), and
// reservations book a specific table for a time window. A table holds at
// most one active reservation per overlapping window - that single rule
// (plus a party-size-vs-capacity check) is what gives every table real
// capacity enforcement, the chef's table included, with no special-casing.
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class ReservationError extends Error {}

const INACTIVE_STATUSES: readonly string[] = ['cancelled', 'no_show'];
const RESERVATION_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'] as const;
type ReservationStatus = typeof RESERVATION_STATUSES[number];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

export async function listTables({ locationId }: { locationId?: string } = {}) {
  await ready();
  let query = db.select().from(schema.reservationTables).$dynamic();
  if (locationId) query = query.where(eq(schema.reservationTables.locationId, locationId));
  return query.orderBy(asc(schema.reservationTables.name));
}

export async function createTable({ locationId, name, type, capacity }: { locationId: string; name: string; type?: string | null; capacity: number }) {
  await ready();
  const [location] = await db.select().from(schema.reservationLocations).where(eq(schema.reservationLocations.id, locationId));
  if (!location) throw new ReservationError(`No location with id ${locationId}`);
  const trimmed = name?.trim();
  if (!trimmed) throw new ReservationError('Table name is required');
  if (!Number.isInteger(capacity) || capacity <= 0) throw new ReservationError('Capacity must be a positive whole number');
  const [dupe] = await db.select().from(schema.reservationTables)
    .where(and(eq(schema.reservationTables.locationId, locationId), eq(schema.reservationTables.name, trimmed)));
  if (dupe) throw new ReservationError(`${location.name} already has a table named "${trimmed}"`);

  const [row] = await db.insert(schema.reservationTables).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    locationId,
    name: trimmed,
    type: type?.trim() || null,
    capacity,
  }).returning();
  return row;
}

export async function updateTable(id: string, { name, type, capacity }: { name?: string; type?: string | null; capacity?: number }) {
  await ready();
  const [existing] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, id));
  if (!existing) throw new ReservationError(`No table with id ${id}`);

  const patch: { name?: string; type?: string | null; capacity?: number } = {};
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

  const [row] = await db.update(schema.reservationTables).set(patch).where(eq(schema.reservationTables.id, id)).returning();
  return row;
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
  }).returning();
  return row;
}

export async function updateReservationStatus(id: string, status: string) {
  await ready();
  if (!RESERVATION_STATUSES.includes(status as ReservationStatus)) {
    throw new ReservationError(`Invalid status: ${status}`);
  }
  const [existing] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id));
  if (!existing) throw new ReservationError(`No reservation with id ${id}`);
  const [row] = await db.update(schema.reservations).set({ status: status as ReservationStatus })
    .where(eq(schema.reservations.id, id)).returning();
  return row;
}

export async function deleteReservation(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id));
  if (!existing) throw new ReservationError(`No reservation with id ${id}`);
  await db.delete(schema.reservations).where(eq(schema.reservations.id, id));
}
