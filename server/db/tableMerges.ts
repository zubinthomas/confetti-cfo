// Ad-hoc table merging for Sienna's floor (Phase 2 of the guest-register
// work). When a party is too big for any single table even with overflow
// seating, staff physically push two or more tables together. A merge:
//
//   - is created from the guest-register assign-table flow (the over_capacity
//     branch), or standalone from the day view;
//   - makes its member tables seat as one unit of `combinedCapacity`
//     (see checkTableAssignment in guestSignIns.ts);
//   - keeps each member table bookable for slots *outside* the occupying
//     party's turn window + `bufferMinutes` (see mergeBlockWindow, used by
//     createReservation / extend / reschedule);
//   - auto-releases (releasedAt set) when the occupying party signs out, is
//     freed, moved, or deleted - or manually via the day view.
//
// "At most one active merge per table" is enforced here (checked before the
// insert transaction, house style - see divisionScope.ts). No DB-level
// backstop: a Postgres partial index can't reference another table's
// releasedAt, and two staff merging the same table on the shared terminal at
// the same millisecond is not a real threat.
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { istNow, toMinutes } from './reservationsTime.ts';

export class TableMergeError extends Error {}

const MERGE_KINDS = ['adjacent', 'end_to_end'] as const;
export type MergeKind = typeof MERGE_KINDS[number];
const DEFAULT_BUFFER_MIN = 30;
/** Seats typically lost joining tables end-to-end (blocked ends). */
const END_TO_END_SEAT_LOSS = 2;

export interface MergeView {
  id: string;
  createdDate: string;
  mergeKind: MergeKind;
  combinedCapacity: number;
  bufferMinutes: number;
  releasedAt: string | null;
  tableIds: string[];
  tableNames: string[];
  locationId: string | null;
}

// ── Read ─────────────────────────────────────────────────────────────────

async function hydrate(merges: (typeof schema.tableMerges.$inferSelect)[]): Promise<MergeView[]> {
  if (merges.length === 0) return [];
  const members = await db.select({
    mergeId: schema.tableMergeMembers.mergeId,
    tableId: schema.tableMergeMembers.tableId,
    tableName: schema.reservationTables.name,
    locationId: schema.reservationTables.locationId,
  })
    .from(schema.tableMergeMembers)
    .innerJoin(schema.reservationTables, eq(schema.reservationTables.id, schema.tableMergeMembers.tableId))
    .where(inArray(schema.tableMergeMembers.mergeId, merges.map((m) => m.id)));

  return merges.map((m) => {
    const mine = members.filter((x) => x.mergeId === m.id);
    return {
      id: m.id,
      createdDate: m.createdDate,
      mergeKind: m.mergeKind,
      combinedCapacity: m.combinedCapacity,
      bufferMinutes: m.bufferMinutes,
      releasedAt: m.releasedAt,
      tableIds: mine.map((x) => x.tableId),
      tableNames: mine.map((x) => x.tableName),
      locationId: mine[0]?.locationId ?? null,
    };
  });
}

export async function listActiveMerges(): Promise<MergeView[]> {
  await ready();
  const rows = await db.select().from(schema.tableMerges).where(isNull(schema.tableMerges.releasedAt));
  return hydrate(rows);
}

/** The active merge a table belongs to, or null. */
export async function activeMergeForTable(tableId: string): Promise<MergeView | null> {
  const active = await listActiveMerges();
  return active.find((m) => m.tableIds.includes(tableId)) ?? null;
}

/** All table ids grouped with `tableId` by an active merge, including
 *  `tableId` itself. Just `[tableId]` when it isn't merged. Use this to widen
 *  a per-table conflict scan to the whole physical unit. */
export async function mergedGroup(tableId: string): Promise<string[]> {
  const merge = await activeMergeForTable(tableId);
  return merge && merge.tableIds.length > 0 ? merge.tableIds : [tableId];
}

/** IST minute window `[startMin, endMin)` on `dateStr` during which the
 *  member tables of `merge` are not available for an independent booking -
 *  the occupying party's turn window stretched by `bufferMinutes`. null when
 *  `dateStr` is not affected. */
export async function mergeBlockWindow(
  merge: MergeView, dateStr: string,
): Promise<{ startMin: number; endMin: number } | null> {
  await ready();
  const guests = await db.select().from(schema.guestSignIns)
    .where(and(inArray(schema.guestSignIns.tableId, merge.tableIds), isNull(schema.guestSignIns.signedOutAt)));
  const seatedRes = await db.select().from(schema.reservations)
    .where(and(inArray(schema.reservations.tableId, merge.tableIds), eq(schema.reservations.status, 'seated')));

  const occupant = guests.find((g) => g.seatedAt) ?? null;
  if (occupant?.seatedAt) {
    const s = istNow(new Date(occupant.seatedAt));
    if (dateStr !== s.date) return null;
    const e = occupant.expectedUntil ? istNow(new Date(occupant.expectedUntil)) : { minutes: s.minutes + 120 };
    return { startMin: s.minutes, endMin: Math.min(24 * 60, Math.max(e.minutes, s.minutes) + merge.bufferMinutes) };
  }
  if (seatedRes.length > 0) {
    const r = seatedRes[0];
    if (dateStr !== r.date) return null;
    const startMin = toMinutes(r.time);
    return { startMin, endMin: Math.min(24 * 60, startMin + r.durationMinutes + merge.bufferMinutes) };
  }
  // Merge with nobody seated yet (just created): block the rest of today only.
  const now = istNow();
  return dateStr === now.date ? { startMin: now.minutes, endMin: 24 * 60 } : null;
}

// ── Capacity suggestion ──────────────────────────────────────────────────

export function suggestCombinedCapacity(
  tables: { capacity: number; maxExtraCapacity: number }[], kind: MergeKind,
): number {
  const withOverflow = tables.reduce((s, t) => s + t.capacity + t.maxExtraCapacity, 0);
  if (kind === 'end_to_end') return Math.max(1, withOverflow - END_TO_END_SEAT_LOSS);
  return withOverflow;
}

// ── Write ────────────────────────────────────────────────────────────────

export async function createMerge(
  userId: number,
  { tableIds, mergeKind, combinedCapacity, bufferMinutes }:
  { tableIds: string[]; mergeKind: string; combinedCapacity?: number; bufferMinutes?: number },
): Promise<MergeView> {
  await ready();
  const uniqueIds = [...new Set(tableIds ?? [])];
  if (uniqueIds.length < 2) throw new TableMergeError('A merge needs at least two different tables');
  if (!MERGE_KINDS.includes(mergeKind as MergeKind)) {
    throw new TableMergeError(`Merge kind must be one of: ${MERGE_KINDS.join(', ')}`);
  }
  const tables = await db.select().from(schema.reservationTables)
    .where(inArray(schema.reservationTables.id, uniqueIds));
  if (tables.length !== uniqueIds.length) throw new TableMergeError('One or more tables no longer exist');
  const locationIds = new Set(tables.map((t) => t.locationId));
  if (locationIds.size > 1) throw new TableMergeError('All tables in a merge must be in the same area');

  const active = await listActiveMerges();
  for (const t of tables) {
    if (active.some((m) => m.tableIds.includes(t.id))) {
      throw new TableMergeError(`${t.name} is already part of another active merge`);
    }
  }

  const capacity = combinedCapacity ?? suggestCombinedCapacity(tables, mergeKind as MergeKind);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new TableMergeError('Combined capacity must be a positive whole number');
  }
  const buffer = bufferMinutes ?? DEFAULT_BUFFER_MIN;
  if (!Number.isInteger(buffer) || buffer < 0) {
    throw new TableMergeError('Buffer minutes must be a whole number of 0 or more');
  }

  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.tableMerges).values({
      id,
      createdDate: new Date().toISOString(),
      mergeKind: mergeKind as MergeKind,
      combinedCapacity: capacity,
      bufferMinutes: buffer,
      createdByUserId: userId,
      releasedAt: null,
    });
    for (const tableId of uniqueIds) {
      await tx.insert(schema.tableMergeMembers).values({ mergeId: id, tableId });
    }
  });

  const [view] = await hydrate([{
    id, createdDate: '', mergeKind: mergeKind as MergeKind, combinedCapacity: capacity,
    bufferMinutes: buffer, createdByUserId: userId, releasedAt: null,
  }]);
  return view;
}

/** Mark a merge released (idempotent). Returns the updated view, or null if
 *  the id is unknown. */
export async function releaseMerge(id: string): Promise<MergeView | null> {
  await ready();
  const [existing] = await db.select().from(schema.tableMerges).where(eq(schema.tableMerges.id, id));
  if (!existing) return null;
  if (!existing.releasedAt) {
    await db.update(schema.tableMerges).set({ releasedAt: new Date().toISOString() })
      .where(eq(schema.tableMerges.id, id));
  }
  const [row] = await db.select().from(schema.tableMerges).where(eq(schema.tableMerges.id, id));
  const [view] = await hydrate([row]);
  return view;
}

/** Release whatever active merge `tableId` is in - a no-op if none. Called
 *  from the sign-out / free-table / move / delete paths. */
export async function releaseMergeForTable(tableId: string): Promise<void> {
  const merge = await activeMergeForTable(tableId);
  if (merge) await releaseMerge(merge.id);
}
