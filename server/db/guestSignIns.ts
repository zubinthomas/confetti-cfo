// Guest sign-in register for Sienna's front of house - the digital version of
// the handwritten arrivals book. A sign-in is NOT a reservation: a walk-in or
// function guest has no booked window, no capacity ceiling of its own, and
// often no table yet. It reuses the reservations area/table catalogue and
// can link to a booking row, but lives in its own table (see schema.ts) so
// none of the reservation overlap/capacity machinery applies to it.
//
// It IS table-aware, though: once the floor seats a party, assignTable checks
// the chosen table against upcoming bookings (a hard clash the host resolves
// by rescheduling the booking) and against whoever is already sitting there
// (an occupied table is refused outright).
//
// Wall-clock note: real instants (signedInAt, seatedAt, expectedUntil) are
// stored as UTC ISO strings, but reservations store `date`/`time` as naive
// IST strings. All floor math here converts through reservations.ts's istNow
// / istDayBounds, which apply the fixed UTC+5:30 offset explicitly - so this
// is correct regardless of the server process timezone.
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { escapeLikeTerm } from '../db.ts';
import {
  ReservationError, updateReservationStatus,
  listActiveReservationOverlaps, listTables, toMinutes, fromMinutes, istNow, istDayBounds,
} from './reservations.ts';
import { activeMergeForTable, mergedGroup, releaseMergeForTable } from './tableMerges.ts';
import { listOccupants } from './tableOccupancy.ts';

/** `code` drives the assign-table UI branch (reservation_clash | table_occupied |
 *  over_capacity); `detail` carries the ids/numbers that branch needs. A plain
 *  GuestSignInError (no code) is just a 400. */
export class GuestSignInError extends Error {
  code?: string;
  detail?: Record<string, unknown>;
  constructor(message: string, code?: string, detail?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

const VISIT_TYPES = ['walk_in', 'event'] as const;
type VisitType = typeof VISIT_TYPES[number];
const LINK_ADVANCES_RESERVATION = true;
const DEFAULT_TURN_MINUTES = 90;

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

export interface CreateSignInInput {
  guestName: string;
  visitType?: VisitType;
  guestPhone?: string;
  guestEmail?: string;
  partySize?: number;
  purpose?: string;
  host?: string;
  areaId?: string | null;
  tableId?: string | null;
  reservationId?: string | null;
  signedInAt?: string;
  expectedUntil?: string;
  notes?: string;
  quotedWaitMinutes?: number;
}

// ── Read ─────────────────────────────────────────────────────────────────

function signInQuery() {
  return db
    .select({
      id: schema.guestSignIns.id,
      createdDate: schema.guestSignIns.createdDate,
      visitType: schema.guestSignIns.visitType,
      guestName: schema.guestSignIns.guestName,
      guestPhone: schema.guestSignIns.guestPhone,
      guestEmail: schema.guestSignIns.guestEmail,
      partySize: schema.guestSignIns.partySize,
      purpose: schema.guestSignIns.purpose,
      host: schema.guestSignIns.host,
      areaId: schema.guestSignIns.areaId,
      areaName: schema.reservationAreas.name,
      tableId: schema.guestSignIns.tableId,
      tableName: schema.reservationTables.name,
      tableCapacity: schema.reservationTables.capacity,
      tableMaxExtraCapacity: schema.reservationTables.maxExtraCapacity,
      reservationId: schema.guestSignIns.reservationId,
      reservationTime: schema.reservations.time,
      reservationGuestName: schema.reservations.guestName,
      reservationStatus: schema.reservations.status,
      signedInAt: schema.guestSignIns.signedInAt,
      seatedAt: schema.guestSignIns.seatedAt,
      expectedUntil: schema.guestSignIns.expectedUntil,
      signedOutAt: schema.guestSignIns.signedOutAt,
      notes: schema.guestSignIns.notes,
      sortOrder: schema.guestSignIns.sortOrder,
      quotedWaitMinutes: schema.guestSignIns.quotedWaitMinutes,
      notifiedAt: schema.guestSignIns.notifiedAt,
      notifiedVia: schema.guestSignIns.notifiedVia,
      createdByUserId: schema.guestSignIns.createdByUserId,
    })
    .from(schema.guestSignIns)
    .leftJoin(schema.reservationAreas, eq(schema.reservationAreas.id, schema.guestSignIns.areaId))
    .leftJoin(schema.reservationTables, eq(schema.reservationTables.id, schema.guestSignIns.tableId))
    .leftJoin(schema.reservations, eq(schema.reservations.id, schema.guestSignIns.reservationId))
    .$dynamic();
}

export async function listSignIns(
  { date, areaId, onPremisesOnly, unseatedOnly }:
  { date?: string; areaId?: string; onPremisesOnly?: boolean; unseatedOnly?: boolean } = {},
) {
  await ready();
  let query = signInQuery();
  const conditions = [];
  // `date` is an IST calendar day; signedInAt is a UTC ISO timestamp. Match
  // rows whose instant falls in that IST business day, [start, next start).
  if (date) {
    const { gte: from, lt: until } = istDayBounds(date);
    conditions.push(gte(schema.guestSignIns.signedInAt, from));
    conditions.push(lt(schema.guestSignIns.signedInAt, until));
  }
  if (areaId) conditions.push(eq(schema.guestSignIns.areaId, areaId));
  if (onPremisesOnly) conditions.push(isNull(schema.guestSignIns.signedOutAt));
  // The physical queue at the door: on premises, no table assigned yet.
  if (unseatedOnly) conditions.push(isNull(schema.guestSignIns.tableId));
  if (conditions.length > 0) query = query.where(and(...conditions));
  return unseatedOnly
    ? query.orderBy(asc(schema.guestSignIns.sortOrder), asc(schema.guestSignIns.signedInAt))
    : query.orderBy(desc(schema.guestSignIns.signedInAt));
}

const SIGN_IN_PAGE_SIZE = 50;
const SIGN_IN_MAX_PAGE_SIZE = 200;

export interface SignInPageFilter {
  /** IST calendar days, inclusive. */
  from?: string;
  to?: string;
  areaId?: string;
  tableId?: string;
  visitType?: string;
  /** Guest name, phone, email, host, purpose or table name, case-insensitive. */
  q?: string;
  /** 'signedOut' (default) or 'onPremises'. */
  state?: string;
  limit?: number;
  offset?: number;
}

/** One page of register entries across all days, newest first, for the
 *  "All" side of the Signed out card. Filters combine with AND; ties on
 *  signedInAt fall back to id so a page boundary never repeats or drops a row. */
export async function listSignInPage(f: SignInPageFilter = {}) {
  await ready();
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (f.from && !isDate(f.from)) throw new GuestSignInError('From date must be in YYYY-MM-DD format');
  if (f.to && !isDate(f.to)) throw new GuestSignInError('To date must be in YYYY-MM-DD format');
  if (f.visitType && !(VISIT_TYPES as readonly string[]).includes(f.visitType)) throw new GuestSignInError(`Invalid visit type: ${f.visitType}`);
  if (f.state && f.state !== 'signedOut' && f.state !== 'onPremises') throw new GuestSignInError('State must be signedOut or onPremises');
  const limit = Math.min(Math.max(Math.trunc(f.limit ?? SIGN_IN_PAGE_SIZE) || SIGN_IN_PAGE_SIZE, 1), SIGN_IN_MAX_PAGE_SIZE);
  const offset = Math.max(Math.trunc(f.offset ?? 0) || 0, 0);

  const conditions = [f.state === 'onPremises' ? isNull(schema.guestSignIns.signedOutAt) : isNotNull(schema.guestSignIns.signedOutAt)];
  if (f.from) conditions.push(gte(schema.guestSignIns.signedInAt, istDayBounds(f.from).gte));
  if (f.to) conditions.push(lt(schema.guestSignIns.signedInAt, istDayBounds(f.to).lt));
  if (f.areaId) conditions.push(eq(schema.guestSignIns.areaId, f.areaId));
  if (f.tableId) conditions.push(eq(schema.guestSignIns.tableId, f.tableId));
  if (f.visitType) conditions.push(eq(schema.guestSignIns.visitType, f.visitType as VisitType));
  const q = f.q?.trim();
  if (q) {
    const term = `%${escapeLikeTerm(q)}%`;
    conditions.push(or(
      ilike(schema.guestSignIns.guestName, term), ilike(schema.guestSignIns.guestPhone, term),
      ilike(schema.guestSignIns.guestEmail, term), ilike(schema.guestSignIns.host, term),
      ilike(schema.guestSignIns.purpose, term), ilike(schema.reservationTables.name, term),
    )!);
  }
  const where = and(...conditions);

  const rows = await signInQuery()
    .where(where)
    .orderBy(desc(schema.guestSignIns.signedInAt), asc(schema.guestSignIns.id))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.guestSignIns)
    .leftJoin(schema.reservationTables, eq(schema.reservationTables.id, schema.guestSignIns.tableId))
    .where(where);
  return { rows, total: Number(total) };
}

async function getSignIn(id: string) {
  const [row] = await signInQuery().where(eq(schema.guestSignIns.id, id));
  return row;
}

/** Next sortOrder for a new queue entry, scoped to parties still unseated and
 *  on premises at the same area (including unassigned, areaId null) -
 *  so a new walk-in joins at the back of its own area's line. */
async function nextSortOrder(areaId: string | null): Promise<number> {
  const rows = await db
    .select({ sortOrder: schema.guestSignIns.sortOrder, areaId: schema.guestSignIns.areaId })
    .from(schema.guestSignIns)
    .where(and(isNull(schema.guestSignIns.tableId), isNull(schema.guestSignIns.signedOutAt)));
  const scoped = rows.filter((r) => r.areaId === areaId);
  return scoped.length > 0 ? Math.max(...scoped.map((r) => r.sortOrder)) + 1 : 1;
}

// ── Wait estimate (read-only) ───────────────────────────────────────────

/** Minutes until the soonest capacity-eligible table is free, or `0` if one
 *  already is, or `null` if no table in this area could ever seat a party
 *  this size. Scoped per-table, not merge-aware - this is a soft estimate,
 *  not the hard gate checkTableAssignment runs at actual seating time. */
export async function estimateWaitMinutes(
  { areaId, partySize }: { areaId?: string; partySize: number },
) {
  await ready();
  if (!Number.isInteger(partySize) || partySize <= 0) {
    throw new GuestSignInError('Party size must be a positive whole number');
  }

  const tables = (await listTables({ areaId })).filter((t) => t.capacity + t.maxExtraCapacity >= partySize);
  if (tables.length === 0) return null;
  const tableIds = tables.map((t) => t.id);

  const { date: today, minutes: nowMin } = istNow(new Date());
  const { gte: dayFrom, lt: dayUntil } = istDayBounds(today);

  const seatedRes = await db.select().from(schema.reservations).where(and(
    inArray(schema.reservations.tableId, tableIds),
    eq(schema.reservations.status, 'seated'),
    eq(schema.reservations.date, today),
  ));
  const seatedGuests = (await db.select().from(schema.guestSignIns).where(and(
    inArray(schema.guestSignIns.tableId, tableIds),
    isNull(schema.guestSignIns.signedOutAt),
  ))).filter((g) => {
    const at = g.seatedAt ?? g.signedInAt;
    return at >= dayFrom && at < dayUntil;
  });

  let best: number | null = null;
  for (const table of tables) {
    const resEnds = seatedRes
      .filter((r) => r.tableId === table.id)
      .map((r) => toMinutes(r.time) + r.durationMinutes);
    const guestEnds = seatedGuests
      .filter((g) => g.tableId === table.id)
      .map((g) => istNow(new Date(g.expectedUntil ?? addMinutesIso(g.seatedAt ?? g.signedInAt, DEFAULT_TURN_MINUTES))).minutes);
    const ends = [...resEnds, ...guestEnds];
    if (ends.length === 0) return 0; // this table is free right now
    const minutesUntilFree = Math.max(0, Math.min(...ends) - nowMin);
    if (best === null || minutesUntilFree < best) best = minutesUntilFree;
  }
  return best;
}

// ── Table assignment checks ──────────────────────────────────────────────

/** Validates seating `partySize` at `tableId` for the window
 *  [seatIso, expectedUntil). Throws a coded GuestSignInError on a booking
 *  clash, an occupied table, or a party that won't fit. Returns the table
 *  on success.
 *
 *  `excludeReservationId` is this sign-in's own linked booking, if any: it is
 *  neither a clash (it IS this party) nor an occupant to merge with, even once
 *  link automation has advanced it to `seated`. `excludeSignInId` is this
 *  sign-in itself, excluded from the occupied-now guest sum on a re-seat. */
async function checkTableAssignment(
  { tableId, partySize, seatIso, expectedUntil, excludeSignInId, excludeReservationId }:
  { tableId: string; partySize: number; seatIso: string; expectedUntil: string | null; excludeSignInId?: string; excludeReservationId?: string },
) {
  const [table] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, tableId));
  if (!table) throw new GuestSignInError(`No table with id ${tableId}`);
  if (table.archivedAt) throw new GuestSignInError(`${table.name} is archived and can't be assigned`);

  const seatAt = istNow(new Date(seatIso));
  const startMin = seatAt.minutes;
  const endMin = expectedUntil ? istNow(new Date(expectedUntil)).minutes : startMin + DEFAULT_TURN_MINUTES;

  // If this table is physically merged with others, every check below runs
  // against the whole unit, and its ceiling is the merge's combinedCapacity.
  const merge = await activeMergeForTable(tableId);
  const groupIds = merge?.tableIds.length ? merge.tableIds : [tableId];
  const unitName = merge ? merge.tableNames.join(' + ') : table.name;
  const capacity = merge ? merge.combinedCapacity : table.capacity + table.maxExtraCapacity;

  // (A) An upcoming booking (not yet seated) on this table/unit overlapping
  // the seating window is a hard block - the host reschedules it first.
  const overlaps = await listActiveReservationOverlaps({
    tableId: groupIds, date: seatAt.date, startMin, endMin: Math.max(endMin, startMin + 1), excludeId: excludeReservationId,
  });
  const upcoming = overlaps.filter((r) => r.status === 'pending' || r.status === 'confirmed');
  if (upcoming.length > 0) {
    const r = upcoming[0];
    throw new GuestSignInError(
      `${unitName} is booked ${r.time}–${fromMinutes(toMinutes(r.time) + r.durationMinutes)} for ${r.guestName}. Reschedule that booking to seat a walk-in here.`,
      'reservation_clash',
      { reservationId: r.id, reservationTime: r.time, tableName: unitName },
    );
  }

  // (B) Anyone physically at the unit blocks it outright: an occupied table is
  // not offered to another party, whoever is asking. Counted by the same
  // module the booking side uses, so a walk-in and a seated booking can't both
  // end up on one table.
  const [occupant] = await listOccupants(groupIds, {
    now: new Date(seatIso), excludeSignInId, excludeReservationId,
  });
  if (occupant) {
    throw new GuestSignInError(
      `${unitName} is occupied until about ${occupant.until}. Pick another table, or wait until they leave.`,
      'table_occupied',
      { tableName: unitName, until: occupant.until },
    );
  }

  // How to say the ceiling: a bare number, or "4 + 2 extra", or "8 when joined".
  const capacityText = merge
    ? `${capacity} seats when joined`
    : table.maxExtraCapacity > 0
      ? `${capacity} seats (${table.capacity} + ${table.maxExtraCapacity} extra)`
      : `${capacity} seats`;

  if (partySize > capacity) {
    throw new GuestSignInError(
      `${unitName} has ${capacityText} - a party of ${partySize} won't fit.`,
      'over_capacity',
      { tableName: unitName, occupants: 0, partySize, capacity, combined: partySize, alreadyMerged: !!merge },
    );
  }

  return table;
}

// ── Write ────────────────────────────────────────────────────────────────

export async function createSignIn(userId: number, input: CreateSignInInput) {
  await ready();
  const guestName = input.guestName?.trim();
  if (!guestName) throw new GuestSignInError('Guest name is required');

  const visitType = input.visitType ?? 'walk_in';
  if (!VISIT_TYPES.includes(visitType)) throw new GuestSignInError(`Invalid visit type: ${visitType}`);

  const partySize = input.partySize ?? 1;
  if (!Number.isInteger(partySize) || partySize <= 0) {
    throw new GuestSignInError('Party size must be a positive whole number');
  }

  let areaId = input.areaId ?? null;
  if (areaId) {
    const [area] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, areaId));
    if (!area) throw new GuestSignInError(`No area with id ${areaId}`);
    if (area.archivedAt) throw new GuestSignInError(`${area.name} is archived and can't be used`);
  }

  const reservationId = input.reservationId ?? null;
  let reservation: typeof schema.reservations.$inferSelect | undefined;
  if (reservationId) {
    [reservation] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, reservationId));
    if (!reservation) throw new GuestSignInError(`No reservation with id ${reservationId}`);
  }

  const signedInAt = input.signedInAt ?? new Date().toISOString();
  if (!isIso(signedInAt)) throw new GuestSignInError('signedInAt must be an ISO timestamp');
  if (input.expectedUntil !== undefined && input.expectedUntil !== null && !isIso(input.expectedUntil)) {
    throw new GuestSignInError('expectedUntil must be an ISO timestamp');
  }
  if (input.quotedWaitMinutes !== undefined && input.quotedWaitMinutes !== null) {
    if (!Number.isInteger(input.quotedWaitMinutes) || input.quotedWaitMinutes < 0) {
      throw new GuestSignInError('Quoted wait must be a whole number of minutes');
    }
  }

  let tableId = input.tableId ?? null;
  let seatedAt: string | null = null;
  let expectedUntil: string | null = input.expectedUntil ?? null;
  let sortOrder = 0;
  if (tableId) {
    const table = await checkTableAssignment({
      tableId, partySize, seatIso: signedInAt, expectedUntil,
      excludeReservationId: reservationId ?? undefined,
    });
    seatedAt = signedInAt;
    expectedUntil = expectedUntil ?? addMinutesIso(signedInAt, DEFAULT_TURN_MINUTES);
    if (!areaId) areaId = table.areaId;
  } else {
    tableId = null;
    expectedUntil = null;
    // Joining the physical queue at the door - takes a spot at the back of
    // its area's line.
    sortOrder = await nextSortOrder(areaId);
  }

  const id = randomUUID();
  await db.insert(schema.guestSignIns).values({
    id,
    createdDate: new Date().toISOString(),
    visitType,
    guestName,
    guestPhone: input.guestPhone?.trim() || null,
    guestEmail: input.guestEmail?.trim() || null,
    partySize,
    purpose: input.purpose?.trim() || null,
    host: input.host?.trim() || null,
    areaId,
    tableId,
    reservationId,
    signedInAt,
    seatedAt,
    expectedUntil,
    signedOutAt: null,
    notes: input.notes?.trim() || null,
    sortOrder,
    quotedWaitMinutes: input.quotedWaitMinutes ?? null,
    createdByUserId: userId,
  });

  await maybeAdvanceReservation(reservation, 'seated');
  return getSignIn(id);
}

export async function updateSignIn(id: string, patch: Partial<CreateSignInInput> & { visitType?: VisitType }) {
  await ready();
  const [existing] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!existing) throw new GuestSignInError(`No sign-in with id ${id}`);

  const set: Partial<typeof schema.guestSignIns.$inferInsert> = {};
  if (patch.guestName !== undefined) {
    const n = patch.guestName?.trim();
    if (!n) throw new GuestSignInError('Guest name is required');
    set.guestName = n;
  }
  if (patch.visitType !== undefined) {
    if (!VISIT_TYPES.includes(patch.visitType)) throw new GuestSignInError(`Invalid visit type: ${patch.visitType}`);
    set.visitType = patch.visitType;
  }
  if (patch.partySize !== undefined) {
    if (!Number.isInteger(patch.partySize) || patch.partySize <= 0) {
      throw new GuestSignInError('Party size must be a positive whole number');
    }
    set.partySize = patch.partySize;
  }
  if (patch.guestPhone !== undefined) set.guestPhone = patch.guestPhone?.trim() || null;
  if (patch.guestEmail !== undefined) set.guestEmail = patch.guestEmail?.trim() || null;
  if (patch.purpose !== undefined) set.purpose = patch.purpose?.trim() || null;
  if (patch.host !== undefined) set.host = patch.host?.trim() || null;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  if (patch.areaId !== undefined) {
    if (patch.areaId) {
      const [area] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, patch.areaId));
      if (!area) throw new GuestSignInError(`No area with id ${patch.areaId}`);
      if (area.archivedAt) throw new GuestSignInError(`${area.name} is archived and can't be used`);
    }
    set.areaId = patch.areaId || null;
  }

  if (Object.keys(set).length === 0) return getSignIn(id);
  await db.update(schema.guestSignIns).set(set).where(eq(schema.guestSignIns.id, id));
  return getSignIn(id);
}

/** Seat a party at a table (or move them). Pass `tableId: null` to unseat.
 *  Runs the clash / occupied / capacity checks. */
export async function assignTable(
  id: string,
  { tableId, expectedUntil }: { tableId: string | null; expectedUntil?: string },
) {
  await ready();
  const [existing] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!existing) throw new GuestSignInError(`No sign-in with id ${id}`);
  if (existing.signedOutAt) throw new GuestSignInError('This guest has already signed out');

  if (!tableId) {
    await db.update(schema.guestSignIns).set({ tableId: null, expectedUntil: null }).where(eq(schema.guestSignIns.id, id));
    if (existing.tableId) await releaseMergeForTable(existing.tableId);
    return getSignIn(id);
  }

  const nowIso = new Date().toISOString();
  const seatIso = existing.seatedAt ?? nowIso;
  let nextExpected = expectedUntil ?? existing.expectedUntil ?? addMinutesIso(seatIso, DEFAULT_TURN_MINUTES);
  if (!isIso(nextExpected)) throw new GuestSignInError('expectedUntil must be an ISO timestamp');
  if (new Date(nextExpected).getTime() <= new Date(seatIso).getTime()) {
    nextExpected = addMinutesIso(seatIso, DEFAULT_TURN_MINUTES);
  }

  await checkTableAssignment({
    tableId, partySize: existing.partySize, seatIso, expectedUntil: nextExpected,
    excludeSignInId: id, excludeReservationId: existing.reservationId ?? undefined,
  });

  await db.update(schema.guestSignIns).set({
    tableId,
    seatedAt: existing.seatedAt ?? nowIso,
    expectedUntil: nextExpected,
  }).where(eq(schema.guestSignIns.id, id));
  // Moving the party off a merged table ends that merge (they were holding it).
  if (existing.tableId && existing.tableId !== tableId) await releaseMergeForTable(existing.tableId);
  return getSignIn(id);
}

/** Staff called/texted a waiting party that their table is ready. Only
 *  meaningful while still unseated and on premises. */
export async function markNotified(id: string, { notifiedVia }: { notifiedVia?: string } = {}) {
  await ready();
  const [existing] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!existing) throw new GuestSignInError(`No sign-in with id ${id}`);
  if (existing.signedOutAt) throw new GuestSignInError('This guest has already signed out');
  if (existing.tableId) throw new GuestSignInError('This guest already has a table');

  await db.update(schema.guestSignIns).set({
    notifiedAt: new Date().toISOString(),
    notifiedVia: notifiedVia?.trim() || 'staff_call',
  }).where(eq(schema.guestSignIns.id, id));
  return getSignIn(id);
}

/** Bump a waiting party up or down against its line neighbor (same area,
 *  unseated + on-premises only), swapping sortOrder atomically. No-op at
 *  either end of the line. */
export async function reorder(id: string, direction: 'up' | 'down') {
  await ready();
  if (direction !== 'up' && direction !== 'down') throw new GuestSignInError('direction must be "up" or "down"');
  const [existing] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!existing) throw new GuestSignInError(`No sign-in with id ${id}`);
  if (existing.tableId || existing.signedOutAt) {
    throw new GuestSignInError('Only parties still waiting can be reordered');
  }

  const group = (await db.select().from(schema.guestSignIns)
    .where(and(isNull(schema.guestSignIns.tableId), isNull(schema.guestSignIns.signedOutAt))))
    .filter((e) => e.areaId === existing.areaId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.signedInAt.localeCompare(b.signedInAt));

  const idx = group.findIndex((e) => e.id === id);
  const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= group.length) return getSignIn(id);
  const neighbor = group[neighborIdx];

  await db.transaction(async (tx) => {
    await tx.update(schema.guestSignIns).set({ sortOrder: neighbor.sortOrder }).where(eq(schema.guestSignIns.id, existing.id));
    await tx.update(schema.guestSignIns).set({ sortOrder: existing.sortOrder }).where(eq(schema.guestSignIns.id, neighbor.id));
  });
  return getSignIn(id);
}

/** Push a seated walk-in's expected turn time out, capped at the next booking
 *  on the table (mirrors extendReservation). */
export async function extendSignIn(id: string, { minutes }: { minutes: number }) {
  await ready();
  const [existing] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!existing) throw new GuestSignInError(`No sign-in with id ${id}`);
  if (existing.signedOutAt) throw new GuestSignInError('This guest has already signed out');
  if (!existing.tableId) throw new GuestSignInError('This guest has no table to extend');
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new GuestSignInError('Extension must be a positive number of minutes');
  }

  const base = existing.expectedUntil ?? existing.seatedAt ?? new Date().toISOString();
  const nextExpected = addMinutesIso(base, minutes);
  const seatAt = istNow(new Date(existing.seatedAt ?? base));
  const endMin = istNow(new Date(nextExpected)).minutes;
  const upcoming = (await listActiveReservationOverlaps({
    tableId: await mergedGroup(existing.tableId), date: seatAt.date, startMin: seatAt.minutes, endMin,
    excludeId: existing.reservationId ?? undefined,
  })).filter((r) => r.status === 'pending' || r.status === 'confirmed');
  if (upcoming.length > 0) {
    const r = upcoming[0];
    throw new GuestSignInError(`The next booking on this table starts at ${r.time} (${r.guestName})`);
  }

  await db.update(schema.guestSignIns).set({ expectedUntil: nextExpected }).where(eq(schema.guestSignIns.id, id));
  return getSignIn(id);
}

export async function signOut(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!existing) throw new GuestSignInError(`No sign-in with id ${id}`);
  if (existing.signedOutAt) throw new GuestSignInError('This guest is already signed out');

  await db.update(schema.guestSignIns).set({ signedOutAt: new Date().toISOString() }).where(eq(schema.guestSignIns.id, id));
  if (existing.tableId) await releaseMergeForTable(existing.tableId);

  if (existing.reservationId) {
    const [r] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, existing.reservationId));
    await maybeAdvanceReservation(r, 'completed');
  }
  return getSignIn(id);
}

export async function deleteSignIn(id: string) {
  await ready();
  const [existing] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!existing) throw new GuestSignInError(`No sign-in with id ${id}`);
  await db.delete(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (existing.tableId && !existing.signedOutAt) await releaseMergeForTable(existing.tableId);
}

/** Best-effort reservation lifecycle nudge from a linked sign-in. 'seated'
 *  only fires from pending/confirmed; 'completed' only from seated. A
 *  ReservationError (e.g. a race on the EXCLUDE constraint) is surfaced as a
 *  GuestSignInError so it reads as a 400, not a 500. */
async function maybeAdvanceReservation(
  reservation: typeof schema.reservations.$inferSelect | undefined,
  to: 'seated' | 'completed',
) {
  if (!reservation || !LINK_ADVANCES_RESERVATION) return;
  const from = to === 'seated' ? ['pending', 'confirmed'] : ['seated'];
  if (!from.includes(reservation.status)) return;
  try {
    await updateReservationStatus(reservation.id, to, { skipOccupancyCheck: true });
  } catch (err) {
    if (err instanceof ReservationError) throw new GuestSignInError(err.message);
    throw err;
  }
}
