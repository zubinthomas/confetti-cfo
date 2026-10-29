// Checks the guest self check-in backend against a throwaway PGlite dir with a
// fixed clock: the availability engine (occupancy, booking buffer, joined
// tables, queue, caps), the settings/token rules and the area flags.
//   node db/verify-checkin.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkin-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const R = await import('./reservations.ts');
const S = await import('./checkinSettings.ts');
const { checkAvailability, checkArea } = await import('./tableCheck.ts');
const { randomUUID } = await import('node:crypto');

await ready();

// ── Pure engine ──────────────────────────────────────────────────────────
const NOW = 15 * 60 + 30; // 15:30
const t = (id: string, capacity: number) => ({ id, capacity });
const base = {
  partySize: 2, tables: [t('a', 2)], canJoin: () => false,
  occupiedUntil: new Map<string, number>(), bookings: new Map<string, { start: number; end: number }[]>(),
  nowMin: NOW, bufferMin: 90, partiesAhead: 0, minutesPerParty: 15, maxWaitMin: 180,
};
const run = (over: Partial<typeof base>) => checkAvailability({ ...base, ...over });

assert.deepEqual(run({}), { status: 'available', minutes: 0, joined: false, partiesAhead: 0, tablesFree: 1, tablesTotal: 1 });

// Occupied until 16:00: a 30 minute wait. Overdue occupants count as 5 minutes.
assert.equal(run({ occupiedUntil: new Map([['a', 16 * 60]]) }).minutes, 30);
assert.equal(run({ occupiedUntil: new Map([['a', 15 * 60]]) }).minutes, 5, 'past their finish: assume a few more minutes');
assert.equal(run({ occupiedUntil: new Map([['a', 16 * 60]]) }).tablesFree, 0);

// The soonest of several tables wins, and only tables that fit count.
const three = run({
  partySize: 3, tables: [t('a', 2), t('b', 4), t('c', 4)],
  occupiedUntil: new Map([['b', 16 * 60], ['c', 15 * 60 + 45]]),
});
assert.equal(three.status, 'wait');
assert.equal(three.minutes, 15, 'c frees first');

// Booking buffer: a booking exactly 90 minutes out does not block, 89 does.
const at = (startOffset: number, len = 60) => new Map([['a', [{ start: NOW + startOffset, end: NOW + startOffset + len }]]]);
assert.equal(run({ bookings: at(90) }).status, 'available', 'booking exactly one buffer away');
const blocked = run({ bookings: at(89) });
assert.equal(blocked.status, 'wait');
assert.equal(blocked.minutes, 150, 'free again when that booking ends (89 + 60 = 149, rounded up)');
assert.equal(run({ bookings: at(89), bufferMin: 60 }).status, 'available', 'a smaller buffer offers it');
assert.equal(run({ bookings: at(-10, 90) }).minutes, 80, 'a late booking holds the table until it ends');
assert.equal(run({ bookings: new Map([['a', [{ start: NOW - 10, end: 24 * 60 }]]]) }).status, 'long_wait', 'not free again today');

// Two joined tables, only when the rule allows.
const pair = { partySize: 4, tables: [t('a', 2), t('b', 2)] };
assert.deepEqual(run({ ...pair, canJoin: () => true }), { status: 'available', minutes: 0, joined: true, partiesAhead: 0, tablesFree: 2, tablesTotal: 2 });
assert.equal(run({ ...pair }).status, 'too_large', 'unlinked tables are not offered together');
const pairWait = run({ ...pair, canJoin: () => true, occupiedUntil: new Map([['a', 16 * 60], ['b', 16 * 60 + 20]]) });
assert.equal(pairWait.minutes, 50, 'a joined pair is ready when both are');
// A single table beats a pair on a tie.
assert.equal(run({ partySize: 3, tables: [t('a', 2), t('b', 2), t('c', 4)], canJoin: () => true }).joined, false);

// People ahead add time per party, and make "available" a wait.
assert.deepEqual([run({ partiesAhead: 2 }).status, run({ partiesAhead: 2 }).minutes], ['wait', 30]);
// Caps.
assert.equal(run({ occupiedUntil: new Map([['a', NOW + 170]]), partiesAhead: 1 }).status, 'long_wait');
assert.equal(run({ partySize: 9, tables: [t('a', 6), t('b', 6)], canJoin: () => false }).status, 'too_large');
assert.equal(run({ tables: [] }).status, 'too_large');

// ── Settings, token, areas ───────────────────────────────────────────────
const s0 = await S.getCheckinSettings();
assert.equal(s0.enabled, false);
assert.ok(s0.token.length >= 20, 'a random token is made on first read');
assert.equal(s0.bookingBufferMinutes, 90);
assert.equal(s0.shopUrl, S.DEFAULT_SHOP_URL);
assert.equal((await S.getCheckinSettings()).token, s0.token, 'the token is stable');
assert.equal(await S.checkinTokenValid(s0.token), false, 'refused while switched off');
await S.updateCheckinSettings({ enabled: true });
assert.equal(await S.checkinTokenValid(s0.token), true);
assert.equal(await S.checkinTokenValid('nope'), false);
assert.equal(await S.checkinTokenValid(undefined), false);
assert.equal(await S.checkinTokenValid(''), false);
const rotated = await S.rotateCheckinToken();
assert.notEqual(rotated.token, s0.token);
assert.equal(await S.checkinTokenValid(s0.token), false, 'old links die on rotate');
assert.equal(await S.checkinTokenValid(rotated.token), true);

await assert.rejects(() => S.updateCheckinSettings({ bookingBufferMinutes: -1 }), S.CheckinError);
await assert.rejects(() => S.updateCheckinSettings({ bookingBufferMinutes: 1.5 }), S.CheckinError);
await assert.rejects(() => S.updateCheckinSettings({ maxPartySize: 0 }), S.CheckinError);
await assert.rejects(() => S.updateCheckinSettings({ shopUrl: 'javascript:alert(1)' }), S.CheckinError);
await assert.rejects(() => S.updateCheckinSettings({ shopUrl: 'not a url' }), S.CheckinError);
await assert.rejects(() => S.updateCheckinSettings({ venueWhatsapp: '12345' }), S.CheckinError);
const s1 = await S.updateCheckinSettings({ bookingBufferMinutes: 60, venueWhatsapp: '98765 43210', shopUrl: 'https://example.com/shop' });
assert.deepEqual([s1.bookingBufferMinutes, s1.venueWhatsapp, s1.shopUrl], [60, '919876543210', 'https://example.com/shop']);
assert.equal((await S.updateCheckinSettings({ venueWhatsapp: '' })).venueWhatsapp, null, 'blank clears it');
await S.updateCheckinSettings({ bookingBufferMinutes: 90 });

assert.equal(S.normalisePhone('98765 43210'), '919876543210');
assert.equal(S.normalisePhone('+91 98765-43210'), '919876543210');
assert.equal(S.normalisePhone('12345'), null);
assert.equal(S.normalisePhone(null), null);

const areas = await R.listAreas();
const cafe = areas.find((a) => a.name === 'Cafe')!;
const bar = areas.find((a) => a.name === 'Bar')!;
assert.ok(areas.every((a) => a.checkinEnabled === false));
await S.setCheckinAreas([cafe.id, bar.id]);
assert.deepEqual((await R.listAreas()).filter((a) => a.checkinEnabled).map((a) => a.name).sort(), ['Bar', 'Cafe']);
await S.setCheckinAreas([cafe.id]);
assert.deepEqual((await R.listAreas()).filter((a) => a.checkinEnabled).map((a) => a.name), ['Cafe']);
await assert.rejects(() => S.setCheckinAreas(['missing']), S.CheckinError);

// ── Against the real floor ───────────────────────────────────────────────
// 2026-10-22 15:30 IST.
const NOW_DATE = new Date('2026-10-22T10:00:00Z');
const TODAY = '2026-10-22';
const tbl = (name: string, capacity: number, extra: Record<string, unknown> = {}) => R.createTable({ areaId: cafe.id, name, capacity, ...extra } as never);
const c2a = await tbl('C2a', 2, { freeMerge: true });
const c2b = await tbl('C2b', 2, { freeMerge: true });
const c4 = await tbl('C4', 4);
const barTable = await R.createTable({ areaId: bar.id, name: 'B2', capacity: 2 });
void barTable;

const walkIn = async (tableId: string | null, areaId: string, until: string | null, signedInAt = NOW_DATE.toISOString()) => {
  const id = randomUUID();
  await db.insert(schema.guestSignIns).values({
    id, createdDate: signedInAt, guestName: 'Walk In', visitType: 'walk_in', partySize: 2, areaId, tableId,
    signedInAt, seatedAt: tableId ? signedInAt : null, expectedUntil: until,
  });
  return id;
};
const book = (tableId: string, time: string, duration: number, status: 'pending' | 'confirmed' | 'seated' | 'cancelled' = 'confirmed') =>
  db.insert(schema.reservations).values({ id: randomUUID(), createdDate: NOW_DATE.toISOString(), tableId, date: TODAY, time, durationMinutes: duration, partySize: 2, guestName: 'Booked', status });

let r = await checkArea(cafe.id, 2, NOW_DATE);
assert.deepEqual([r.status, r.tablesFree, r.tablesTotal], ['available', 3, 3]);
r = await checkArea(cafe.id, 4, NOW_DATE);
assert.deepEqual([r.status, r.joined], ['available', false], 'C4 seats four on its own');
r = await checkArea(cafe.id, 5, NOW_DATE);
assert.equal(r.status, 'too_large', 'no pair of the free-merge 2-tops reaches five, and C4 is not linked');

// Occupy C4 until 17:00: four people now wait for the pair of 2-tops instead.
const occ = await walkIn(c4.id, cafe.id, '2026-10-22T11:30:00Z');
r = await checkArea(cafe.id, 4, NOW_DATE);
assert.deepEqual([r.status, r.joined], ['available', true], 'the two free-merge tables join for four');
// A booking on one of the pair 60 minutes from now blocks that pair inside the 90 minute buffer.
await book(c2a.id, '16:30', 60);
r = await checkArea(cafe.id, 4, NOW_DATE);
assert.equal(r.status, 'wait');
assert.equal(r.minutes, 90, 'C4 frees at 17:00, 90 minutes out, which beats waiting for the pair');
// A cancelled booking does not count.
await db.delete(schema.reservations);
await book(c2a.id, '16:30', 60, 'cancelled');
assert.equal((await checkArea(cafe.id, 4, NOW_DATE)).status, 'available');
await db.delete(schema.reservations);

// Waiting parties in the same area, today only.
await walkIn(null, cafe.id, null);
await walkIn(null, cafe.id, null);
await walkIn(null, bar.id, null);
await walkIn(null, cafe.id, null, '2026-10-20T10:00:00Z'); // stale, from another day
r = await checkArea(cafe.id, 2, NOW_DATE);
assert.deepEqual([r.status, r.partiesAhead, r.minutes], ['wait', 2, 30]);
assert.equal((await checkArea(bar.id, 2, NOW_DATE)).partiesAhead, 1);

console.log('checkin checks passed');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
