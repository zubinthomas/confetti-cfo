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
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { listTables, toMinutes, istNow, istDayBounds } from './reservations.ts';
import { listActiveMerges, loadLinkSet, tablesCanMerge } from './tableMerges.ts';
import { listOccupants } from './tableOccupancy.ts';
import { getCheckinSettings } from './checkinSettings.ts';

/** An occupant past their expected finish is still there: assume this much longer. */
const OVERDUE_MINUTES = 5;
const DAY_END = 24 * 60;

/** `seats` is capacity plus the table's overflow seats: what staff can really seat. */
export interface CheckTable { id: string; seats: number }
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
  /** More than one table would be pushed together. */
  joined: boolean;
  /** How many tables the quoted option uses (1 when none are joined). */
  tablesUsed: number;
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

const MAX_GROUP = 6;
const NODE_BUDGET = 20_000;

/** Every set of tables that may be pushed together (each pair allowed to merge,
 *  the rule createMerge enforces), single tables included, up to MAX_GROUP
 *  tables. A node budget keeps a huge free-merge area from stalling a request;
 *  checkAvailability and maxPartyFor share this, so they never disagree. */
export function tableGroups(tables: CheckTable[], canJoin: (a: CheckTable, b: CheckTable) => boolean): CheckTable[][] {
  const out: CheckTable[][] = [];
  let nodes = 0;
  const grow = (group: CheckTable[], from: number) => {
    for (let i = from; i < tables.length && nodes < NODE_BUDGET; i++) {
      if (!group.every((m) => canJoin(m, tables[i]))) continue;
      nodes++;
      const next = [...group, tables[i]];
      out.push(next);
      if (next.length < MAX_GROUP) grow(next, i + 1);
    }
  };
  grow([], 0);
  return out;
}

/** The largest party an area can seat: the biggest seat total over any group of
 *  tables that may be joined. 0 when there are no tables. */
export function maxPartyFor(tables: CheckTable[], canJoin: (a: CheckTable, b: CheckTable) => boolean): number {
  return tableGroups(tables, canJoin).reduce((m, g) => Math.max(m, g.reduce((n, t) => n + t.seats, 0)), 0);
}

export function checkAvailability(i: CheckInput): CheckResult {
  const n = i.partySize;
  type Option = { wait: number; k: number; waste: number };
  const options: Option[] = [];
  for (const g of tableGroups(i.tables, i.canJoin)) {
    const seats = g.reduce((sum, t) => sum + t.seats, 0);
    // Only groups where every member is needed: drop the smallest and it must stop fitting.
    if (seats < n || seats - Math.min(...g.map((t) => t.seats)) >= n) continue;
    options.push({ wait: readyIn(g.map((t) => t.id), i), k: g.length, waste: seats - n });
  }
  const tablesFree = i.tables.filter((t) => readyIn([t.id], i) === 0).length;
  const base = { partiesAhead: i.partiesAhead, tablesFree, tablesTotal: i.tables.length };
  if (options.length === 0) return { ...base, status: 'too_large', minutes: 0, joined: false, tablesUsed: 0 };

  options.sort((x, y) => x.wait - y.wait || x.k - y.k || x.waste - y.waste);
  const best = options[0];
  const used = { joined: best.k > 1, tablesUsed: best.k };
  if (!Number.isFinite(best.wait)) return { ...base, status: 'long_wait', minutes: 0, ...used };
  if (best.wait === 0 && i.partiesAhead === 0) return { ...base, status: 'available', minutes: 0, ...used };

  const quote = best.wait + i.partiesAhead * i.minutesPerParty;
  if (quote > i.maxWaitMin) return { ...base, status: 'long_wait', minutes: 0, ...used };
  return { ...base, status: 'wait', minutes: Math.max(5, Math.ceil(quote / 5) * 5), ...used };
}

type FloorTable = Awaited<ReturnType<typeof listTables>>[number];

/** Seats a table can take and the join rule for a set of tables (all from one area or several). */
async function joinRule(all: FloorTable[]) {
  const linkSet = await loadLinkSet(all.map((t) => t.id));
  const byId = new Map(all.map((t) => [t.id, t]));
  const toCheck = (t: FloorTable): CheckTable => ({ id: t.id, seats: t.capacity + t.maxExtraCapacity });
  const canJoin = (a: CheckTable, b: CheckTable) => tablesCanMerge(byId.get(a.id)!, byId.get(b.id)!, linkSet);
  return { toCheck, canJoin };
}

/** Table count and largest party for every area that has active tables. */
export async function areaLimits(): Promise<Map<string, { tables: number; maxParty: number }>> {
  await ready();
  const all = await listTables({ archived: 'exclude' });
  const { toCheck, canJoin } = await joinRule(all);
  const out = new Map<string, { tables: number; maxParty: number }>();
  for (const areaId of new Set(all.map((t) => t.areaId))) {
    const mine = all.filter((t) => t.areaId === areaId);
    out.set(areaId, { tables: mine.length, maxParty: maxPartyFor(mine.map(toCheck), canJoin) });
  }
  return out;
}

/** Every live area for the admin tab: its tables, largest party, and whether
 *  guests are offered it. */
export async function checkinAreaSummary() {
  await ready();
  const limits = await areaLimits();
  const rows = await db.select({
    id: schema.reservationAreas.id, name: schema.reservationAreas.name, floor: schema.reservationAreas.floor,
    offered: schema.reservationAreas.checkinEnabled,
  })
    .from(schema.reservationAreas)
    .innerJoin(schema.reservationLocations, eq(schema.reservationLocations.id, schema.reservationAreas.locationId))
    .where(and(isNull(schema.reservationAreas.archivedAt), isNull(schema.reservationLocations.archivedAt)))
    .orderBy(asc(schema.reservationAreas.createdDate), asc(schema.reservationAreas.name));
  return rows.map((a) => ({ ...a, tables: limits.get(a.id)?.tables ?? 0, maxParty: limits.get(a.id)?.maxParty ?? 0 }));
}

/** Today's picture of one area, then checkAvailability on it. `now` is for tests. */
export async function checkArea(areaId: string, partySize: number, now = new Date()): Promise<CheckResult> {
  await ready();
  const settings = await getCheckinSettings();
  const { date: today, minutes: nowMin } = istNow(now);

  const all = await listTables({ areaId, archived: 'exclude' });
  const tableIds = all.map((t) => t.id);

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

  const { toCheck, canJoin } = await joinRule(all);
  const tables = all.map(toCheck);

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
