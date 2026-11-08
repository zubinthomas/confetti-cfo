// Checks the day-rollover stale-occupancy sweep: a booking left `seated`, or
// a sign-in (seated or still queued) never signed out, closes on its own once
// its day is no longer today - with the right provenance flag, the right
// cascade, and the right order between the two sweeps - against a throwaway
// PGlite dir with a fixed clock.
//   node db/verify-stale-sweep.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-sweep-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const R = await import('./reservations.ts');
const GS = await import('./guestSignIns.ts');
const { eq } = await import('drizzle-orm');
const { randomUUID } = await import('node:crypto');

await ready();

// 2026-10-22 15:30 IST.
const NOW = new Date('2026-10-22T10:00:00Z');
const NOW_ISO = NOW.toISOString();
const TODAY = '2026-10-22';
const YESTERDAY = '2026-10-21';
const YESTERDAY_ISO = '2026-10-21T10:00:00Z';

const areas = await R.listAreas();
const cafe = areas.find((a) => a.name === 'Cafe')!;
const tbl = (name: string) => R.createTable({ areaId: cafe.id, name, capacity: 4 });

type Status = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
const book = async (
  tableId: string, date: string, time: string, duration: number, status: Status,
  opts: { groupId?: string; guestName?: string } = {},
) => {
  const id = randomUUID();
  await db.insert(schema.reservations).values({
    id, createdDate: NOW_ISO, tableId, date, time, durationMinutes: duration, partySize: 2,
    guestName: opts.guestName ?? 'Guest', status, groupId: opts.groupId ?? null,
  });
  return id;
};
const signIn = async (opts: {
  tableId?: string | null; at: string; tableGroupId?: string; reservationId?: string; name?: string;
}) => {
  const id = randomUUID();
  await db.insert(schema.guestSignIns).values({
    id, createdDate: opts.at, guestName: opts.name ?? 'Walk In', visitType: 'walk_in', partySize: 2,
    areaId: cafe.id, tableId: opts.tableId ?? null, signedInAt: opts.at,
    seatedAt: opts.tableId ? opts.at : null, tableGroupId: opts.tableGroupId ?? null, reservationId: opts.reservationId ?? null,
  });
  return id;
};
const resRow = async (id: string) => (await db.select().from(schema.reservations).where(eq(schema.reservations.id, id)))[0];
const signRow = async (id: string) => (await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id)))[0];

// ── Reservations: singleton, grouped, and what the sweep leaves alone ────
const t1 = await tbl('S1');
const staleSingle = await book(t1.id, YESTERDAY, '19:00', 90, 'seated');

const t2 = await tbl('S2');
const t3 = await tbl('S3');
const groupId = randomUUID();
const staleGroupA = await book(t2.id, YESTERDAY, '19:00', 90, 'seated', { groupId });
const staleGroupB = await book(t3.id, YESTERDAY, '19:00', 90, 'seated', { groupId });

const t4 = await tbl('S4');
const freshSeated = await book(t4.id, TODAY, '14:00', 90, 'seated'); // today, untouched

const t5 = await tbl('S5');
const staleButCompleted = await book(t5.id, YESTERDAY, '19:00', 90, 'completed'); // already closed

const closedRes = await R.sweepStaleReservations(NOW);
assert.deepEqual(
  closedRes.map((r) => r.id).sort(),
  [staleSingle, staleGroupA, staleGroupB].sort(),
  'sweeps every stale seated booking, singleton and grouped, skipping today and already-closed rows',
);

const single = await resRow(staleSingle);
assert.equal(single.status, 'completed');
assert.equal(single.autoClosedAt, NOW_ISO);
assert.equal(single.durationMinutes, 90, 'a stale booking is never duration-trimmed - only today-dated ones are');

const groupA = await resRow(staleGroupA);
const groupB = await resRow(staleGroupB);
assert.equal(groupA.status, 'completed');
assert.equal(groupB.status, 'completed');
assert.ok(groupA.autoClosedAt && groupB.autoClosedAt, 'both siblings in the group close together');

assert.equal((await resRow(freshSeated)).status, 'seated', "today's seated booking is left alone");
assert.equal((await resRow(staleButCompleted)).autoClosedAt, null, 'an already-closed row is never touched, let alone flagged auto-closed');

assert.deepEqual(await R.sweepStaleReservations(NOW), [], 'a second run finds nothing left to close');

// ── A human close (endReservationEarly) never sets the auto flag ─────────
const t6 = await tbl('S6');
const humanClosed = await book(t6.id, TODAY, '14:00', 90, 'seated');
await R.endReservationEarly(humanClosed);
assert.equal((await resRow(humanClosed)).autoClosedAt, null, 'a human free-table close is not mistaken for an automatic one');

// ── Sign-ins: seated, unseated queue entry, grouped, and what's left alone ─
const g1 = await tbl('G1');
const staleSeatedGuest = await signIn({ tableId: g1.id, at: YESTERDAY_ISO });

const staleQueueGuest = await signIn({ tableId: null, at: YESTERDAY_ISO }); // never got a table - still swept

const g2 = await tbl('G2');
const g3 = await tbl('G3');
const tableGroupId = randomUUID();
const staleGroupGuestA = await signIn({ tableId: g2.id, at: YESTERDAY_ISO, tableGroupId });
const staleGroupGuestB = await signIn({ tableId: g3.id, at: YESTERDAY_ISO, tableGroupId });

const g4 = await tbl('G4');
const freshGuest = await signIn({ tableId: g4.id, at: NOW_ISO }); // today, untouched

const closedSigns = await GS.sweepStaleSignIns(NOW);
assert.deepEqual(
  closedSigns.map((s) => s.id).sort(),
  [staleSeatedGuest, staleQueueGuest, staleGroupGuestA, staleGroupGuestB].sort(),
  'sweeps every stale sign-in still on premises, seated or still in the queue, grouped ones together',
);

for (const id of [staleSeatedGuest, staleQueueGuest, staleGroupGuestA, staleGroupGuestB]) {
  const row = await signRow(id);
  assert.ok(row.signedOutAt, 'closed means signed out');
  assert.equal(row.autoClosedAt, row.signedOutAt, 'auto-closed stamp matches the close time');
}
assert.equal((await signRow(freshGuest)).signedOutAt, null, "today's on-premises guest is left alone");

assert.deepEqual(await GS.sweepStaleSignIns(NOW), [], 'a second run finds nothing left to close');

// A human sign-out never sets the auto flag either.
const g5 = await tbl('G5');
const humanGuest = await signIn({ tableId: g5.id, at: NOW_ISO });
await GS.signOut(humanGuest);
assert.equal((await signRow(humanGuest)).autoClosedAt, null);

// ── Run order: reservations before sign-ins owns the booking's own flag ───
const t7 = await tbl('S7');
const linkedRes = await book(t7.id, YESTERDAY, '19:00', 90, 'seated');
const linkedGuest = await signIn({ tableId: t7.id, at: YESTERDAY_ISO, reservationId: linkedRes });

await R.sweepStaleReservations(NOW); // reservations first, as the scheduler does
await GS.sweepStaleSignIns(NOW);

const linkedResRow = await resRow(linkedRes);
assert.equal(linkedResRow.status, 'completed');
assert.equal(linkedResRow.autoClosedAt, NOW_ISO, "the reservation's own sweep owns its flag - the sign-in sweep's advance is a no-op by the time it runs");
assert.ok((await signRow(linkedGuest)).signedOutAt, 'the linked sign-in still closes too');

// ── A stale seated booking holding a merge releases it ────────────────────
const m1 = await tbl('S8');
const m2 = await tbl('S9');
const mergeId = randomUUID();
await db.insert(schema.tableMerges).values({ id: mergeId, createdDate: NOW_ISO, mergeKind: 'adjacent', combinedCapacity: 8 });
await db.insert(schema.tableMergeMembers).values([{ mergeId, tableId: m1.id }, { mergeId, tableId: m2.id }]);
await book(m1.id, YESTERDAY, '19:00', 90, 'seated');
await R.sweepStaleReservations(NOW);
const [releasedMerge] = await db.select().from(schema.tableMerges).where(eq(schema.tableMerges.id, mergeId));
assert.ok(releasedMerge.releasedAt, 'merge released by the sweep');

// ── Today-bounded counts ───────────────────────────────────────────────────
const resCountToday = await R.countAutoClosedReservationsToday(NOW);
const signCountToday = await GS.countAutoClosedSignInsToday(NOW);
// staleSingle, staleGroupA, staleGroupB, linkedRes = 4; the merge-release booking adds a 5th.
assert.equal(resCountToday, 5, 'counts every reservation auto-closed today, IST-bounded');
assert.equal(signCountToday, 5, 'counts every sign-in auto-closed today (4 above + the linked guest)');

// A row auto-closed on a different IST day does not count as "today".
const t10 = await tbl('S10');
const otherDayClosed = await book(t10.id, YESTERDAY, '19:00', 90, 'seated');
await db.update(schema.reservations).set({ status: 'completed', autoClosedAt: '2026-10-20T10:00:00.000Z' })
  .where(eq(schema.reservations.id, otherDayClosed));
assert.equal(await R.countAutoClosedReservationsToday(NOW), 5, "a different day's auto-close is excluded");

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(`${dir}.lock`, { force: true });
console.log('stale sweep: ok');
process.exit(0);
