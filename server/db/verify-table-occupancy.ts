// Checks live table occupancy (walk-ins and seated bookings), the guards that
// keep an occupied table closed to new parties on both the booking and the
// register side, and the best-fit "move to another table" options, against a
// throwaway PGlite dir with a fixed clock.
//   node db/verify-table-occupancy.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'table-occupancy-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const R = await import('./reservations.ts');
const { createSignIn, assignTable, GuestSignInError } = await import('./guestSignIns.ts');
const { listOccupancy } = await import('./tableOccupancy.ts');
const { createMerge } = await import('./tableMerges.ts');
const { eq } = await import('drizzle-orm');
const { randomUUID } = await import('node:crypto');

await ready();
const [user] = await db.insert(schema.users).values({ email: 'verify@example.com', passwordHash: 'x', createdAt: new Date().toISOString() }).returning();
const UID = user.id;

// 2026-10-22 15:30 IST.
const NOW = new Date('2026-10-22T10:00:00Z');
const NOW_ISO = NOW.toISOString();
const TODAY = '2026-10-22';
const UNTIL_1700 = new Date('2026-10-22T11:30:00Z').toISOString(); // 17:00 IST

const areas = await R.listAreas();
const cafe = areas.find((a) => a.name === 'Cafe')!;
const bar = areas.find((a) => a.name === 'Bar')!;
const tbl = (name: string, capacity: number, areaId = cafe.id, extra: Record<string, unknown> = {}) =>
  R.createTable({ areaId, name, capacity, ...extra } as never);

type Status = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
const book = async (tableId: string, time: string, duration: number, status: Status, partySize = 2, guestName = 'Guest', date = TODAY) => {
  const id = randomUUID();
  await db.insert(schema.reservations).values({
    id, createdDate: NOW_ISO, tableId, date, time, durationMinutes: duration, partySize, guestName, status,
  });
  return id;
};
const walkIn = async (tableId: string, opts: { partySize?: number; at?: string; until?: string | null; name?: string } = {}) => {
  const id = randomUUID();
  const at = opts.at ?? NOW_ISO;
  await db.insert(schema.guestSignIns).values({
    id, createdDate: at, guestName: opts.name ?? 'Walk In', visitType: 'walk_in', partySize: opts.partySize ?? 2,
    areaId: cafe.id, tableId, signedInAt: at, seatedAt: at, expectedUntil: opts.until === undefined ? UNTIL_1700 : opts.until,
  });
  return id;
};
const signOut = (id: string) => db.update(schema.guestSignIns).set({ signedOutAt: NOW_ISO }).where(eq(schema.guestSignIns.id, id));
const row = async (id: string) => (await db.select().from(schema.reservations).where(eq(schema.reservations.id, id)))[0];

// ── Occupancy listing ────────────────────────────────────────────────────
const c4 = await tbl('C4', 4);
const b2 = await tbl('B2', 2, bar.id);

assert.deepEqual(await listOccupancy(NOW), [], 'nothing occupied on an empty floor');

const w1 = await walkIn(c4.id, { partySize: 2 });
let occ = await listOccupancy(NOW);
assert.equal(occ.length, 1);
assert.deepEqual(occ[0], { tableId: c4.id, parties: 1, covers: 2, until: '17:00', walkIn: true });
assert.ok(!('guestName' in occ[0]), 'occupancy is anonymous');

// A seated booking counts; a sign-in linked to a seated booking is the same party.
const seatedRes = await book(b2.id, '15:00', 90, 'seated', 2, 'Anita');
occ = await listOccupancy(NOW);
const b2row = occ.find((o) => o.tableId === b2.id)!;
assert.deepEqual({ parties: b2row.parties, covers: b2row.covers, until: b2row.until, walkIn: b2row.walkIn }, { parties: 1, covers: 2, until: '16:30', walkIn: false });
const linked = randomUUID();
await db.insert(schema.guestSignIns).values({
  id: linked, createdDate: NOW_ISO, guestName: 'Anita', visitType: 'walk_in', partySize: 2, areaId: bar.id,
  tableId: b2.id, reservationId: seatedRes, signedInAt: NOW_ISO, seatedAt: NOW_ISO, expectedUntil: UNTIL_1700,
});
assert.equal((await listOccupancy(NOW)).find((o) => o.tableId === b2.id)!.covers, 2, 'linked sign-in is not double counted');
await db.delete(schema.guestSignIns).where(eq(schema.guestSignIns.id, linked));
await db.delete(schema.reservations).where(eq(schema.reservations.id, seatedRes));

// Stale rows from an earlier day are not "right now".
const stale = await walkIn(b2.id, { at: '2026-10-19T10:00:00Z', until: null });
assert.equal((await listOccupancy(NOW)).find((o) => o.tableId === b2.id), undefined, 'a prior-day sign-in never signed out is ignored');
await db.delete(schema.guestSignIns).where(eq(schema.guestSignIns.id, stale));

// ── Seating a booking onto an occupied table ─────────────────────────────
const late = await book(c4.id, '15:00', 90, 'confirmed', 3, 'Late Lena');
await assert.rejects(() => R.updateReservationStatus(late, 'seated', { now: NOW }), /walk-in party is at C4 \(until about 17:00\)/);
assert.equal((await row(late)).status, 'confirmed', 'a refused seat changes nothing');
await assert.doesNotReject(() => R.updateReservationStatus(late, 'cancelled', { now: NOW }), 'other transitions are untouched');
await R.updateReservationStatus(late, 'confirmed', { now: NOW });
await signOut(w1);
await assert.doesNotReject(() => R.updateReservationStatus(late, 'seated', { now: NOW }), 'seatable once the walk-in has signed out');
assert.equal((await row(late)).status, 'seated');
// A seated booking blocks a second booking being seated on the same table.
const second = await book(c4.id, '17:00', 60, 'confirmed', 2, 'Second');
await assert.rejects(() => R.updateReservationStatus(second, 'seated', { now: NOW }), /seated booking is at C4/);
await db.delete(schema.reservations).where(eq(schema.reservations.id, second));
await db.delete(schema.reservations).where(eq(schema.reservations.id, late));

// A party past its expected finish is still occupying the table until signed out.
const overstayer = await walkIn(b2.id, { until: '2026-10-22T08:00:00Z' }); // 13:30 IST, now 15:30
const overdue = await book(b2.id, '17:00', 30, 'confirmed', 2, 'Overdue');
await assert.rejects(() => R.updateReservationStatus(overdue, 'seated', { now: NOW }), /expected to leave at 13:30, still there/);
await db.delete(schema.reservations).where(eq(schema.reservations.id, overdue));
await signOut(overstayer);

// ── Creating and rescheduling over "now" on an occupied table ────────────
const w2 = await walkIn(c4.id);
const input = (time: string) => ({ tableId: c4.id, date: TODAY, time, durationMinutes: 60, partySize: 2, guestName: 'New' });
await assert.rejects(() => R.createReservation(UID, input('15:00'), NOW), /walk-in party is at C4/, 'window containing now is refused');
await assert.rejects(() => R.createReservation(UID, input('14:45'), NOW), /walk-in party is at C4/, 'started earlier, still running');
const evening = await R.createReservation(UID, input('19:00'), NOW);
assert.equal(evening.time, '19:00', 'a later window is fine');
await assert.doesNotReject(() => R.createReservation(UID, { ...input('17:30'), tableId: b2.id, partySize: 2 }, NOW), 'other tables are unaffected');
await assert.rejects(() => R.rescheduleReservation(evening.id, { time: '15:00' }, NOW), /walk-in party is at C4/);
await assert.doesNotReject(() => R.rescheduleReservation(evening.id, { time: '20:00' }, NOW));
await db.delete(schema.reservations).where(eq(schema.reservations.tableId, b2.id));

// ── Walk-in assignment on the register side ─────────────────────────────
const gs = await createSignIn(UID, { guestName: 'Pat', partySize: 2 });
// assignTable seats "now" on the real clock, so its occupant uses the real clock too.
const realNow = new Date();
const r1 = await tbl('R1', 4);
await walkIn(r1.id, { at: realNow.toISOString(), until: new Date(realNow.getTime() + 3_600_000).toISOString() });
await assert.rejects(() => assignTable(gs.id, { tableId: r1.id }), (e: unknown) => e instanceof GuestSignInError && e.code === 'table_occupied');
await assert.rejects(
  () => createSignIn(UID, { guestName: 'Sam', partySize: 2, tableId: c4.id, signedInAt: NOW_ISO }),
  (e: unknown) => e instanceof GuestSignInError && e.code === 'table_occupied' && /until about 17:00/.test(e.message),
);
await signOut(w2);
await db.delete(schema.reservations).where(eq(schema.reservations.id, evening.id));
const free = await tbl('C9', 4);
await assert.doesNotReject(() => assignTable(gs.id, { tableId: free.id }), 'a free table still seats a walk-in');
await db.delete(schema.guestSignIns).where(eq(schema.guestSignIns.id, gs.id));

// ── A linked sign-in advances its booking without tripping the guard ─────
const linkedBooking = await book(free.id, '15:30', 60, 'confirmed', 2, 'Linked');
await db.update(schema.reservations).set({ status: 'completed' }).where(eq(schema.reservations.tableId, free.id));
await db.update(schema.reservations).set({ status: 'confirmed' }).where(eq(schema.reservations.id, linkedBooking));
const linkSign = await createSignIn(UID, { guestName: 'Linked', partySize: 2, tableId: free.id, reservationId: linkedBooking, signedInAt: NOW_ISO });
assert.equal((await row(linkedBooking)).status, 'seated', 'register link still seats the booking');
await signOut(linkSign.id);
await db.delete(schema.reservations).where(eq(schema.reservations.id, linkedBooking));

// ── Best-fit seating options ─────────────────────────────────────────────
await db.delete(schema.reservations);
await db.delete(schema.guestSignIns);
await db.delete(schema.reservationTables); // fresh floor for the ranking checks
const a4 = await tbl('A4', 4);            // the late party's own table, occupied
const a4b = await tbl('A4b', 4);          // same area, spare 1
const b4 = await tbl('B4', 4, bar.id);    // other area, spare 1
const a6 = await tbl('A6', 6);            // spare 3
const a2 = await tbl('A2', 2);            // too small
const a3 = await tbl('A3', 3);            // spare 0, but occupied
const a3b = await tbl('A3b', 3);          // spare 0, but booked in the window
const gone = await tbl('A3c', 3);         // spare 0, archived
await R.archiveTable(gone.id, NOW);

const lateParty = await book(a4.id, '15:00', 90, 'confirmed', 3, 'Late Lena');
await walkIn(a4.id, { partySize: 2, name: 'Sitting Sam' });
await walkIn(a3.id, { partySize: 1 });
await book(a3b.id, '16:00', 60, 'confirmed', 2, 'Booked');

const opts = await R.seatingOptions(lateParty, NOW);
assert.equal(opts.partySize, 3);
assert.equal(opts.currentTable.name, 'A4');
assert.match(opts.currentTable.blockedReason ?? '', /walk-in party is at A4/);
assert.ok(!/Sam/.test(opts.currentTable.blockedReason ?? ''), 'the reason names no guest');
assert.deepEqual(opts.options.map((o) => o.name), ['A4b', 'B4', 'A6'], 'fewest spare seats first, own area breaks the tie; excludes small, occupied, booked, archived');
assert.deepEqual(opts.options.map((o) => o.spare), [1, 1, 3]);
assert.equal(opts.options[0].sameArea, true);
assert.equal(opts.options[1].sameArea, false);

// Moving: refused targets first.
await assert.rejects(() => R.moveReservation(lateParty, { tableId: a2.id }, NOW), /seats up to 2/);
await assert.rejects(() => R.moveReservation(lateParty, { tableId: a3.id, seat: true }, NOW), /walk-in party is at A3/);
await assert.rejects(() => R.moveReservation(lateParty, { tableId: a3b.id }, NOW), /already booked/);
await assert.rejects(() => R.moveReservation(lateParty, { tableId: gone.id }, NOW), /archived/);
await assert.rejects(() => R.moveReservation(lateParty, { tableId: a4.id }, NOW), /already on that table/);
assert.equal((await row(lateParty)).tableId, a4.id, 'refused moves change nothing');

const moved = await R.moveReservation(lateParty, { tableId: a4b.id, seat: true }, NOW);
assert.equal(moved.tableId, a4b.id);
assert.equal(moved.status, 'seated');
assert.equal(moved.time, '15:00', 'time and duration are kept');
const occAfter = await listOccupancy(NOW);
assert.ok(occAfter.find((o) => o.tableId === a4b.id && !o.walkIn), 'the moved party now holds A4b');
assert.ok(occAfter.find((o) => o.tableId === a4.id && o.walkIn), 'the walk-in on A4 is untouched');

// Move without seating keeps the status, and a closed booking can't move.
const pending = await book(a6.id, '19:00', 60, 'pending', 2, 'Evening');
const keep = await R.moveReservation(pending, { tableId: b4.id }, NOW);
assert.equal(keep.status, 'pending');
assert.equal(keep.tableId, b4.id);
await db.update(schema.reservations).set({ status: 'cancelled' }).where(eq(schema.reservations.id, pending));
await assert.rejects(() => R.moveReservation(pending, { tableId: a6.id }, NOW), /can't be moved/);
await assert.rejects(() => R.seatingOptions(pending, NOW), /can't be moved/);

// ── Merged units count as one table ──────────────────────────────────────
const m1 = await tbl('M1', 2, cafe.id, { freeMerge: true });
const m2 = await tbl('M2', 2, cafe.id, { freeMerge: true });
await createMerge(UID, { tableIds: [m1.id, m2.id], mergeKind: 'adjacent' });
await walkIn(m1.id, { partySize: 3 });
const onM2 = await book(m2.id, '15:00', 60, 'confirmed', 2, 'Next Door');
await assert.rejects(() => R.updateReservationStatus(onM2, 'seated', { now: NOW }), /walk-in party is at M1/, 'a walk-in on one half blocks the other half');

console.log('table occupancy checks passed');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
