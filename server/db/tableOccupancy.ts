// Who is physically at a table right now. A table (or the merged unit it
// belongs to) is occupied by a `seated` booking or by a guest-register entry
// with a table and no sign-out. Both the booking side (seat / create /
// reschedule / move) and the register side (assign a walk-in) ask this one
// module, and the day view reads the anonymous version of it, so people with
// different permissions can't double-seat a table.
//
// Only today counts: a booking left `seated` or a walk-in never signed out on
// a past day is stale data, not somebody sitting there.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { toMinutes, fromMinutes, istNow, istDayBounds } from './reservationsTime.ts';
import { mergedGroup } from './tableMerges.ts';

export class TableOccupiedError extends Error {}

const DEFAULT_TURN_MINUTES = 90;

export interface Occupant {
  kind: 'booking' | 'walk_in';
  tableId: string;
  partySize: number;
  /** Wall-clock HH:MM the party is expected to leave, IST. */
  until: string;
  /** Names are only for callers that already hold the right permission. */
  guestName: string;
  reservationId: string | null;
  signInId: string | null;
}

/** Anonymous per-table summary served to anyone who can read the module. */
export interface TableOccupancy {
  tableId: string;
  parties: number;
  covers: number;
  /** Latest expected finish among the parties, HH:MM IST. */
  until: string;
  /** True when at least one party is a register entry (not a booking). */
  walkIn: boolean;
}

function hhmm(iso: string): string {
  const { minutes } = istNow(new Date(iso));
  return fromMinutes(minutes);
}

/** Everyone sitting at `tableIds` right now. A sign-in linked to a booking that
 *  is itself `seated` is the same party as that booking and is counted once.
 *  `excludeReservationId` skips a booking (and any sign-in linked to it);
 *  `excludeSignInId` skips one register entry. */
export async function listOccupants(
  tableIds: string[],
  { now = new Date(), excludeReservationId, excludeSignInId }:
  { now?: Date; excludeReservationId?: string; excludeSignInId?: string } = {},
): Promise<Occupant[]> {
  await ready();
  if (tableIds.length === 0) return [];
  const { date: today } = istNow(now);
  const { gte: dayFrom, lt: dayUntil } = istDayBounds(today);

  const seated = (await db.select().from(schema.reservations)
    .where(and(inArray(schema.reservations.tableId, tableIds), eq(schema.reservations.status, 'seated'))))
    .filter((r) => r.date === today && r.id !== excludeReservationId);
  const seatedIds = new Set(seated.map((r) => r.id));

  const register = (await db.select().from(schema.guestSignIns)
    .where(and(inArray(schema.guestSignIns.tableId, tableIds), isNull(schema.guestSignIns.signedOutAt))))
    .filter((g) => {
      if (g.id === excludeSignInId) return false;
      if (excludeReservationId && g.reservationId === excludeReservationId) return false;
      if (g.reservationId && seatedIds.has(g.reservationId)) return false;
      const at = g.seatedAt ?? g.signedInAt;
      return at >= dayFrom && at < dayUntil;
    });

  const out: Occupant[] = seated.map((r) => ({
    kind: 'booking' as const,
    tableId: r.tableId,
    partySize: r.partySize,
    until: fromMinutes(Math.min(toMinutes(r.time) + r.durationMinutes, 24 * 60 - 1)),
    guestName: r.guestName,
    reservationId: r.id,
    signInId: null as string | null,
  }));
  for (const g of register) {
    const end = g.expectedUntil
      ?? new Date(new Date(g.seatedAt ?? g.signedInAt).getTime() + DEFAULT_TURN_MINUTES * 60_000).toISOString();
    out.push({
      kind: 'walk_in',
      tableId: g.tableId!,
      partySize: g.partySize,
      until: hhmm(end),
      guestName: g.guestName,
      reservationId: g.reservationId,
      signInId: g.id,
    });
  }
  return out;
}

/** Live occupancy for the day view: one anonymous row per occupied table. */
export async function listOccupancy(now = new Date()): Promise<TableOccupancy[]> {
  await ready();
  const { date: today } = istNow(now);
  const { gte: dayFrom, lt: dayUntil } = istDayBounds(today);

  const seated = (await db.select({ tableId: schema.reservations.tableId })
    .from(schema.reservations)
    .where(and(eq(schema.reservations.status, 'seated'), eq(schema.reservations.date, today))));
  const register = (await db.select({ tableId: schema.guestSignIns.tableId, seatedAt: schema.guestSignIns.seatedAt, signedInAt: schema.guestSignIns.signedInAt })
    .from(schema.guestSignIns)
    .where(isNull(schema.guestSignIns.signedOutAt)))
    .filter((g) => g.tableId && (g.seatedAt ?? g.signedInAt) >= dayFrom && (g.seatedAt ?? g.signedInAt) < dayUntil);

  const tableIds = [...new Set([...seated.map((r) => r.tableId), ...register.map((g) => g.tableId!)])];
  const occupants = await listOccupants(tableIds, { now });
  const byTable = new Map<string, TableOccupancy>();
  for (const o of occupants) {
    const cur = byTable.get(o.tableId);
    if (!cur) {
      byTable.set(o.tableId, { tableId: o.tableId, parties: 1, covers: o.partySize, until: o.until, walkIn: o.kind === 'walk_in' });
    } else {
      cur.parties += 1;
      cur.covers += o.partySize;
      if (o.until > cur.until) cur.until = o.until;
      if (o.kind === 'walk_in') cur.walkIn = true;
    }
  }
  return [...byTable.values()];
}

/** Throws when anyone is sitting at `tableId` or at a table merged with it.
 *  The message says who (as a walk-in or a booking, never by name) and until
 *  when, so it is safe to show to a user without register access. */
export async function assertNotOccupied(
  tableId: string,
  opts: { now?: Date; excludeReservationId?: string; excludeSignInId?: string } = {},
): Promise<void> {
  await ready();
  const group = await mergedGroup(tableId);
  const [first] = await listOccupants(group, opts);
  if (!first) return;
  const [t] = await db.select({ name: schema.reservationTables.name }).from(schema.reservationTables)
    .where(eq(schema.reservationTables.id, first.tableId));
  const kind = first.kind === 'walk_in' ? 'A walk-in party' : 'A seated booking';
  throw new TableOccupiedError(`${kind} is at ${t?.name ?? 'this table'} until about ${first.until}`);
}
