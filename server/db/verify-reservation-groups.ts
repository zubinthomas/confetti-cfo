// Checks multi-table ("grouped") reservations - creating one across two
// merged tables, the double-booking guard on each member table, group-wide
// cancel/delete, the auto-merge-on-seated hook, and the move/seating-options
// guard - against a throwaway PGlite dir with a fixed clock.
//   node db/verify-reservation-groups.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reservation-groups-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const R = await import('./reservations.ts');
const { activeMergeForTable } = await import('./tableMerges.ts');
const { eq } = await import('drizzle-orm');

await ready();

const [user] = await db.insert(schema.users).values({ email: 'verify@example.com', passwordHash: 'x', createdAt: new Date().toISOString() }).returning();
const UID = user.id;
const NOW = new Date('2026-10-22T10:00:00Z'); // 15:30 IST

const areas = await R.listAreas();
const cafe = areas.find((a) => a.name === 'Cafe')!;

// Two tables explicitly linked as mergeable, one standalone, mirroring the
// live Cafe config that exposed the original bug (capacity-4 tables, no
// maxExtraCapacity, linked only in pairs).
const t2 = await R.createTable({ areaId: cafe.id, name: 'C2', capacity: 4 });
const t3 = await R.createTable({ areaId: cafe.id, name: 'C3', capacity: 4, mergeableWith: [t2.id] });
const t5 = await R.createTable({ areaId: cafe.id, name: 'C5', capacity: 4 });

// ── Creating a grouped reservation ──────────────────────────────────────
await assert.rejects(
  () => R.createReservation(UID, { tableIds: [t2.id], date: '2026-10-22', time: '19:00', partySize: 8, guestName: 'Party of 8' }),
  /C2 seats up to 4/,
  'a single table still rejects a party too big for it alone',
);
await assert.rejects(
  () => R.createReservation(UID, { tableIds: [t2.id, t5.id], date: '2026-10-22', time: '19:00', partySize: 8, guestName: 'Party of 8' }),
  /aren't set up to merge/,
  'two tables not linked/free-merge are refused even if capacity would fit',
);

const anchor = await R.createReservation(UID, {
  tableIds: [t2.id, t3.id], date: '2026-10-22', time: '19:00', partySize: 8, guestName: 'Party of 8',
});
const siblings = await db.select().from(schema.reservations).where(eq(schema.reservations.groupId, anchor.groupId!));
assert.equal(siblings.length, 2, 'both tables got their own reservation row');
assert.deepEqual(new Set(siblings.map((s) => s.tableId)), new Set([t2.id, t3.id]));
assert.ok(siblings.every((s) => s.partySize === 8 && s.date === '2026-10-22' && s.time === '19:00'), 'siblings share date/time/partySize');

// A normal single-table booking elsewhere is unaffected.
const solo = await R.createReservation(UID, { tableIds: [t5.id], date: '2026-10-22', time: '19:00', partySize: 2, guestName: 'Solo' });
assert.equal(solo.groupId, null, 'a single-table booking has no groupId');

// ── Double-booking guard covers every member table ──────────────────────
await assert.rejects(
  () => R.createReservation(UID, { tableIds: [t3.id], date: '2026-10-22', time: '19:30', partySize: 2, guestName: 'Clash' }),
  /C3 is already booked/,
  'a table held as a group member still blocks a separate overlapping booking',
);

// ── Group-wide move/seating-options guard ───────────────────────────────
await assert.rejects(() => R.seatingOptions(anchor.id), /spans multiple merged tables/);
await assert.rejects(() => R.moveReservation(anchor.id, { tableId: t5.id }), /spans multiple merged tables/);

// ── Seating the group auto-creates a live merge ─────────────────────────
assert.equal(await activeMergeForTable(t2.id), null, 'no merge exists yet');
await R.updateReservationStatus(anchor.id, 'seated', { now: NOW });
const merge = await activeMergeForTable(t2.id);
assert.ok(merge, 'seating the group auto-created a live merge');
assert.deepEqual(new Set(merge!.tableIds), new Set([t2.id, t3.id]));
assert.equal((await activeMergeForTable(t3.id))!.id, merge!.id, 'both member tables point at the same merge');
const reseated = await db.select().from(schema.reservations).where(eq(schema.reservations.groupId, anchor.groupId!));
assert.ok(reseated.every((s) => s.status === 'seated' && s.seatedAt), 'both siblings moved to seated together');

// ── Cancelling/deleting a group acts on every sibling ───────────────────
await R.updateReservationStatus(anchor.id, 'completed', { now: NOW });
assert.equal(await activeMergeForTable(t2.id), null, 'completing the group released the auto-created merge');
const completed = await db.select().from(schema.reservations).where(eq(schema.reservations.groupId, anchor.groupId!));
assert.ok(completed.every((s) => s.status === 'completed'), 'both siblings completed together');

const anchor2 = await R.createReservation(UID, {
  tableIds: [t2.id, t3.id], date: '2026-10-23', time: '19:00', partySize: 8, guestName: 'Party of 8 Again',
});
await R.deleteReservation(anchor2.id);
const afterDelete = await db.select().from(schema.reservations).where(eq(schema.reservations.groupId, anchor2.groupId!));
assert.equal(afterDelete.length, 0, 'deleting the group removed every sibling row');

console.log('OK: verify-reservation-groups');
