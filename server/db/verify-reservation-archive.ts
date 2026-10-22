// Checks archiving of locations, areas and tables (what blocks it, restore,
// permanent delete, name reuse, what an archived row refuses) and the
// automatic no-show sweep, against a throwaway PGlite dir with a fixed clock.
//   node db/verify-reservation-archive.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reservation-archive-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const R = await import('./reservations.ts');
const { createSignIn, GuestSignInError } = await import('./guestSignIns.ts');
const { createMerge, TableMergeError } = await import('./tableMerges.ts');
const { eq } = await import('drizzle-orm');
const { randomUUID } = await import('node:crypto');

await ready();

// 2026-10-22 15:30 IST.
const NOW = new Date('2026-10-22T10:00:00Z');
const TODAY = '2026-10-22';

const [loc] = await R.listLocations();
const areas = await R.listAreas();
const cafe = areas.find((a) => a.name === 'Cafe')!;
const bar = areas.find((a) => a.name === 'Bar')!;

type Status = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
const book = async (tableId: string, date: string, time: string, duration: number, status: Status, guestName = 'Guest') => {
  const id = randomUUID();
  await db.insert(schema.reservations).values({
    id, createdDate: NOW.toISOString(), tableId, date, time, durationMinutes: duration, partySize: 2, guestName, status,
  });
  return id;
};
const statusOf = async (id: string) => (await db.select().from(schema.reservations).where(eq(schema.reservations.id, id)))[0].status;
const names = async (opts = {}) => (await R.listTables(opts)).map((t) => t.name);
const tbl = (name: string, areaId = cafe.id) => R.createTable({ areaId, name, capacity: 4 });

// ── What blocks archiving a table ───────────────────────────────────────
const t = await tbl('A1');
await assert.doesNotReject(async () => { const free = await tbl('A0'); await R.archiveTable(free.id, NOW); }, 'an unused table archives');

const inProgress = await book(t.id, TODAY, '15:00', 60, 'pending'); // ends 16:00, now 15:30
await assert.rejects(() => R.archiveTable(t.id, NOW), /upcoming reservation/, 'in-progress booking blocks (duration counts)');
await db.update(schema.reservations).set({ time: '14:00' }).where(eq(schema.reservations.id, inProgress)); // ends 15:00
await assert.doesNotReject(() => R.archiveTable(t.id, NOW), 'a booking that has ended does not block');
await R.restoreTable(t.id);

await db.delete(schema.reservations).where(eq(schema.reservations.id, inProgress));
const edge = await book(t.id, TODAY, '14:30', 60, 'confirmed'); // ends exactly 15:30 = now
await assert.doesNotReject(() => R.archiveTable(t.id, NOW), 'ending exactly now is over');
await R.restoreTable(t.id);
await db.delete(schema.reservations).where(eq(schema.reservations.id, edge));

const future = await book(t.id, '2026-10-23', '19:00', 90, 'confirmed', 'Asha Rao');
await assert.rejects(() => R.archiveTable(t.id, NOW), /next: 2026-10-23 19:00, Asha Rao/, 'message names the next booking');
for (const s of ['cancelled', 'no_show', 'completed'] as Status[]) {
  await db.update(schema.reservations).set({ status: s }).where(eq(schema.reservations.id, future));
  await assert.doesNotReject(() => R.archiveTable(t.id, NOW), `${s} does not block`);
  await R.restoreTable(t.id);
}
await db.update(schema.reservations).set({ status: 'seated', date: '2026-10-20', time: '12:00', durationMinutes: 60 }).where(eq(schema.reservations.id, future));
await assert.rejects(() => R.archiveTable(t.id, NOW), /upcoming reservation/, 'seated blocks even long after its end');
await db.update(schema.reservations).set({ status: 'completed' }).where(eq(schema.reservations.id, future));

const [signIn] = await Promise.all([db.insert(schema.guestSignIns).values({
  id: randomUUID(), createdDate: NOW.toISOString(), guestName: 'Walk-in', partySize: 2, areaId: cafe.id, tableId: t.id,
  signedInAt: NOW.toISOString(), seatedAt: NOW.toISOString(),
}).returning()]);
await assert.rejects(() => R.archiveTable(t.id, NOW), /signed in/, 'a party at the table blocks');
await db.update(schema.guestSignIns).set({ signedOutAt: NOW.toISOString() }).where(eq(schema.guestSignIns.id, signIn[0].id));

const t2 = await tbl('A2');
const merge = randomUUID();
await db.insert(schema.tableMerges).values({ id: merge, createdDate: NOW.toISOString(), mergeKind: 'adjacent', combinedCapacity: 8 });
await db.insert(schema.tableMergeMembers).values([{ mergeId: merge, tableId: t.id }, { mergeId: merge, tableId: t2.id }]);
await assert.rejects(() => R.archiveTable(t.id, NOW), /merge/, 'a live merge blocks');
await db.update(schema.tableMerges).set({ releasedAt: NOW.toISOString() }).where(eq(schema.tableMerges.id, merge));

// ── Archive, hide, history ──────────────────────────────────────────────
assert.ok((await names()).includes('A1'));
await R.archiveTable(t.id, NOW);
assert.ok(!(await names()).includes('A1'), 'hidden from the default list');
assert.ok((await names({ archived: 'include' })).includes('A1'));
assert.deepEqual(await names({ archived: 'only', areaId: cafe.id }), ['A0', 'A1']);
await assert.rejects(() => R.archiveTable(t.id, NOW), /already archived/);
await assert.rejects(() => R.updateTable(t.id, { capacity: 6 }), /archived/);
await assert.rejects(() => R.createReservation(1, { tableId: t.id, date: '2026-11-01', time: '19:00', partySize: 2, guestName: 'X' }), /archived/);
await assert.rejects(() => createSignIn(1, { guestName: 'X', partySize: 2, tableId: t.id } as never), GuestSignInError);
await assert.rejects(() => createMerge(1, { tableIds: [t.id, t2.id], mergeKind: 'adjacent' } as never), TableMergeError);
await assert.rejects(() => R.createTable({ areaId: cafe.id, name: 'Z', capacity: 2, mergeableWith: [t.id] }), /archived/);
const history = (await R.listTables({ archived: 'include' })).find((x) => x.id === t.id)!;
assert.ok(history.hasHistory && history.archivedAt);
const joined = await R.listReservationPage({});
assert.ok(joined.rows.some((r) => r.tableName === 'A1'), 'bookings keep the archived table name');

// Names are reusable while archived; restore refuses a clash.
const reuse = await tbl('A1');
assert.notEqual(reuse.id, t.id);
await assert.rejects(() => R.restoreTable(t.id), /already has a table named "A1"/);
await R.archiveTable(reuse.id, NOW);
await R.restoreTable(t.id);
assert.ok((await names()).includes('A1'));

// ── Permanent delete only without history ───────────────────────────────
await assert.rejects(() => R.purgeTable(t.id), /archive it instead/);
const unused = await tbl('A9');
await R.purgeTable(unused.id);
assert.ok(!(await names({ archived: 'include' })).includes('A9'));

// ── Areas and locations ─────────────────────────────────────────────────
await assert.rejects(() => R.archiveArea(cafe.id, NOW), /Archive Cafe's tables before/);
const emptyBar = await R.listTables({ areaId: bar.id });
assert.equal(emptyBar.length, 0);
const busy = await tbl('B1', bar.id);
await book(busy.id, '2026-10-24', '18:00', 60, 'pending');
await assert.rejects(() => R.archiveTable(busy.id, NOW), /upcoming/);
await assert.rejects(() => R.archiveArea(bar.id, NOW), /tables/, 'area blocked while its tables are active');
await db.delete(schema.reservations).where(eq(schema.reservations.tableId, busy.id));
await R.archiveTable(busy.id, NOW);
await R.archiveArea(bar.id, NOW);
assert.ok(!(await R.listAreas()).some((a) => a.id === bar.id));
await assert.rejects(() => tbl('B2', bar.id), /archived/);
await assert.rejects(() => R.archiveLocation(loc.id, NOW), /Archive .* areas before/);
await assert.rejects(() => R.restoreTable(busy.id), /Restore Bar first/);
await R.restoreArea(bar.id);
await R.restoreTable(busy.id);

const extra = await R.createLocation({ name: 'Annex' });
const annexArea = await R.createArea({ locationId: extra.id, name: 'Cafe' });
const annexTable = await R.createTable({ areaId: annexArea.id, name: 'X1', capacity: 2 });
await book(annexTable.id, '2026-10-30', '12:00', 60, 'confirmed');
await R.archiveTable(annexTable.id, NOW).then(() => assert.fail('should be blocked'), (e) => assert.match(e.message, /upcoming/));
await db.update(schema.reservations).set({ status: 'cancelled' }).where(eq(schema.reservations.tableId, annexTable.id));
await R.archiveTable(annexTable.id, NOW);
await R.archiveArea(annexArea.id, NOW);
await R.archiveLocation(extra.id, NOW);
assert.ok(!(await R.listLocations()).some((l) => l.id === extra.id));
await assert.rejects(() => R.createArea({ locationId: extra.id, name: 'New' }), /archived/);
await assert.rejects(() => R.purgeLocation(extra.id), /archive it instead/);
const again = await R.createLocation({ name: 'Annex' }); // name free while the old one is archived
await assert.rejects(() => R.restoreLocation(extra.id), /already exists/);
await R.purgeLocation(again.id);
await R.restoreLocation(extra.id);
await assert.rejects(() => R.restoreArea(annexArea.id).then(() => R.restoreArea(annexArea.id)), /not archived/);

// ── Automatic no-show ───────────────────────────────────────────────────
let n = 0;
const own = async (date: string, time: string, duration: number, status: Status) => book((await tbl(`S${++n}`)).id, date, time, duration, status);
const ended = await own(TODAY, '13:00', 60, 'pending');            // ended 14:00
const endedConfirmed = await own(TODAY, '14:00', 60, 'confirmed'); // ended 15:00
const justEnded = await own(TODAY, '14:30', 60, 'confirmed');      // ends 15:30 == now
await db.update(schema.reservations).set({ time: '14:30' }).where(eq(schema.reservations.id, justEnded));
const running = await own(TODAY, '15:00', 60, 'confirmed');        // ends 16:00
const seatedOld = await own(TODAY, '09:00', 60, 'seated');
const doneOld = await own(TODAY, '08:00', 30, 'completed');
const cancelledOld = await own(TODAY, '07:00', 30, 'cancelled');
const yesterday = await own('2026-10-21', '20:00', 60, 'pending');
const tomorrow = await own('2026-10-23', '10:00', 60, 'pending');
const lateNight = await own(TODAY, '23:00', 60, 'pending');       // ends 24:00, still ahead

const changed = await R.markExpiredReservationsNoShow(NOW);
assert.deepEqual(changed.map((r) => r.id).sort(), [ended, endedConfirmed, justEnded, yesterday].sort());
for (const id of [ended, endedConfirmed, justEnded, yesterday]) assert.equal(await statusOf(id), 'no_show');
assert.equal(await statusOf(running), 'confirmed', 'in progress');
assert.equal(await statusOf(seatedOld), 'seated', 'seated is never swept');
assert.equal(await statusOf(doneOld), 'completed');
assert.equal(await statusOf(cancelledOld), 'cancelled');
assert.equal(await statusOf(tomorrow), 'pending');
assert.equal(await statusOf(lateNight), 'pending');
assert.deepEqual(await R.markExpiredReservationsNoShow(NOW), [], 'second run changes nothing');

// One minute later the 15:00 booking is still running; after 16:00 it flips, and 23:00+60 flips at midnight.
assert.equal((await R.markExpiredReservationsNoShow(new Date('2026-10-22T10:29:00Z'))).length, 0);
assert.deepEqual((await R.markExpiredReservationsNoShow(new Date('2026-10-22T10:30:00Z'))).map((r) => r.id), [running]);
assert.deepEqual((await R.markExpiredReservationsNoShow(new Date('2026-10-22T18:29:00Z'))).map((r) => r.id), []);
assert.deepEqual((await R.markExpiredReservationsNoShow(new Date('2026-10-22T18:30:00Z'))).map((r) => r.id), [lateNight]); // 00:00 IST

// A no-show releases the merge its table held.
const m1 = await tbl('N2'); const m2 = await tbl('N3');
const mergeId = randomUUID();
await db.insert(schema.tableMerges).values({ id: mergeId, createdDate: NOW.toISOString(), mergeKind: 'adjacent', combinedCapacity: 8 });
await db.insert(schema.tableMergeMembers).values([{ mergeId, tableId: m1.id }, { mergeId, tableId: m2.id }]);
await book(m1.id, TODAY, '10:00', 60, 'confirmed');
await R.markExpiredReservationsNoShow(NOW);
const [released] = await db.select().from(schema.tableMerges).where(eq(schema.tableMerges.id, mergeId));
assert.ok(released.releasedAt, 'merge released by the sweep');

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(`${dir}.lock`, { force: true });
console.log('reservation archive: ok');
process.exit(0);
