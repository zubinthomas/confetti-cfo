// "Check a Table": how long would a party of N wait for a table in an area, right
// now. The pure core (checkAvailability) works on minutes past midnight so it
// can be tested without a database; checkArea loads the floor and applies the
// settings. Used by the public self check-in page (server/routes/publicCheckin.ts).
//
// A table counts as free from the first minute T at which nobody is on it and
// no pending/confirmed booking overlaps [T, T + buffer). The buffer (default 90)
// is the booking protection window, so a walk-in is only offered a table they
// could plausibly finish at before a reservation. A late booking therefore
// holds its table until it ends.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { listTables, toMinutes, istNow, istDayBounds } from './reservations.ts';
import { listActiveMerges, loadLinkSet, tablesCanMerge } from './tableMerges.ts';
import { listOccupants } from './tableOccupancy.ts';
import { getCheckinSettings } from './checkinSettings.ts';

/** An occupant past their expected finish is still there: assume this much longer. */
const OVERDUE_MINUTES = 5;
const DAY_END = 24 * 60;

export interface CheckTable { id: string; capacity: number }
export interface Slot { start: number; end: number }

export interface CheckInput {
  partySize: number;
  tables: CheckTable[];
  /** May these two tables be pushed together (same area, linked or free-merge)? */
  canJoin: (a: CheckTable, b: CheckTable) => boolean;
  /** Minute of day each occupied table's current party is expected to leave. */
  occupiedUntil: ReadonlyMap<string, number>;
  /** Today's pending/confirmed bookings per table, as minute windows. */
  bookings: ReadonlyMap<string, Slot[]>;
  nowMin: number;
  bufferMin: number;
  partiesAhead: number;
  minutesPerParty: number;
  maxWaitMin: number;
}

export type CheckStatus = 'available' | 'wait' | 'long_wait' | 'too_large';

export interface CheckResult {
  status: CheckStatus;
  /** Quoted wait for 'wait', rounded up to 5. 0 for 'available'. */
  minutes: number;
  /** Two tables joined would be used. */
  joined: boolean;
  partiesAhead: number;
  tablesFree: number;
  tablesTotal: number;
}

/** Minutes from now until the given tables are all free for a full buffer
 *  window, or Infinity when that is not before the end of today. */
function readyIn(ids: string[], i: CheckInput): number {
  let t = i.nowMin;
  for (const id of ids) {
    const until = i.occupiedUntil.get(id);
    if (until === undefined) continue;
    t = Math.max(t, until > i.nowMin ? until : i.nowMin + OVERDUE_MINUTES);
  }
  const slots = ids.flatMap((id) => i.bookings.get(id) ?? []).sort((a, b) => a.start - b.start);
  for (const s of slots) {
    if (s.start < t + i.bufferMin && s.end > t) t = s.end;
  }
  return t >= DAY_END ? Infinity : t - i.nowMin;
}

export function checkAvailability(i: CheckInput): CheckResult {
  const n = i.partySize;
  type Option = { wait: number; k: number; waste: number; ids: string[] };
  const options: Option[] = [];
  for (let a = 0; a < i.tables.length; a++) {
    const ta = i.tables[a];
    if (ta.capacity >= n) options.push({ wait: readyIn([ta.id], i), k: 1, waste: ta.capacity - n, ids: [ta.id] });
    for (let b = a + 1; b < i.tables.length; b++) {
      const tb = i.tables[b];
      if (ta.capacity < n && tb.capacity < n && ta.capacity + tb.capacity >= n && i.canJoin(ta, tb)) {
        options.push({ wait: readyIn([ta.id, tb.id], i), k: 2, waste: ta.capacity + tb.capacity - n, ids: [ta.id, tb.id] });
      }
    }
  }
  const tablesFree = i.tables.filter((t) => readyIn([t.id], i) === 0).length;
  const base = { partiesAhead: i.partiesAhead, tablesFree, tablesTotal: i.tables.length };
  if (options.length === 0) return { ...base, status: 'too_large', minutes: 0, joined: false };

  options.sort((x, y) => x.wait - y.wait || x.k - y.k || x.waste - y.waste);
  const best = options[0];
  if (!Number.isFinite(best.wait)) return { ...base, status: 'long_wait', minutes: 0, joined: best.k === 2 };
  if (best.wait === 0 && i.partiesAhead === 0) return { ...base, status: 'available', minutes: 0, joined: best.k === 2 };

  const quote = best.wait + i.partiesAhead * i.minutesPerParty;
  if (quote > i.maxWaitMin) return { ...base, status: 'long_wait', minutes: 0, joined: best.k === 2 };
  return { ...base, status: 'wait', minutes: Math.max(5, Math.ceil(quote / 5) * 5), joined: best.k === 2 };
}

/** Today's picture of one area, then checkAvailability on it. `now` is for tests. */
export async function checkArea(areaId: string, partySize: number, now = new Date()): Promise<CheckResult> {
  await ready();
  const settings = await getCheckinSettings();
  const { date: today, minutes: nowMin } = istNow(now);

  const all = await listTables({ areaId, archived: 'exclude' });
  const tableIds = all.map((t) => t.id);
  const tables: CheckTable[] = all.map((t) => ({ id: t.id, capacity: t.capacity }));

  // Who is on each table now. A physically merged unit is occupied as a whole.
  const occupiedUntil = new Map<string, number>();
  const occupants = await listOccupants(tableIds, { now });
  const merges = await listActiveMerges();
  const groupOf = (id: string) => merges.find((m) => m.tableIds.includes(id))?.tableIds ?? [id];
  for (const o of occupants) {
    for (const id of groupOf(o.tableId)) {
      if (!tableIds.includes(id)) continue;
      occupiedUntil.set(id, Math.max(occupiedUntil.get(id) ?? 0, toMinutes(o.until)));
    }
  }

  const bookings = new Map<string, Slot[]>();
  if (tableIds.length > 0) {
    const rows = await db.select().from(schema.reservations).where(and(
      inArray(schema.reservations.tableId, tableIds),
      eq(schema.reservations.date, today),
      inArray(schema.reservations.status, ['pending', 'confirmed']),
    ));
    for (const r of rows) {
      const start = toMinutes(r.time);
      const list = bookings.get(r.tableId) ?? [];
      list.push({ start, end: start + r.durationMinutes });
      bookings.set(r.tableId, list);
    }
  }

  const linkSet = await loadLinkSet(tableIds);
  const byId = new Map(all.map((t) => [t.id, t]));
  const canJoin = (a: CheckTable, b: CheckTable) => tablesCanMerge(byId.get(a.id)!, byId.get(b.id)!, linkSet);

  // People already waiting for this area today.
  const { gte, lt } = istDayBounds(today);
  const waiting = (await db.select({ at: schema.guestSignIns.signedInAt }).from(schema.guestSignIns).where(and(
    eq(schema.guestSignIns.areaId, areaId), isNull(schema.guestSignIns.tableId), isNull(schema.guestSignIns.signedOutAt),
  ))).filter((g) => g.at >= gte && g.at < lt).length;

  return checkAvailability({
    partySize, tables, canJoin, occupiedUntil, bookings, nowMin,
    bufferMin: settings.bookingBufferMinutes,
    partiesAhead: waiting,
    minutesPerParty: settings.minutesPerParty,
    maxWaitMin: settings.maxWaitMinutes,
  });
}
