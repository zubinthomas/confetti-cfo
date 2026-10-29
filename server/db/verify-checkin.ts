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
const P = await import('./publicCheckin.ts');
const M = await import('./menu.ts');
const { SlidingWindow } = await import('../middleware/rateLimit.ts');
const { eq } = await import('drizzle-orm');
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

// ── Public page: join, spot, leave, menu ─────────────────────────────────
await db.delete(schema.guestSignIns); // fresh queue and floor
await db.delete(schema.reservations);
assert.deepEqual((await P.publicConfig()).areas.map((a) => a.name), ['Cafe'], 'only areas switched on are offered');
await assert.rejects(() => P.publicCheck(bar.id, 2, NOW_DATE), P.PublicCheckinError, 'an area that is off is refused');
await assert.rejects(() => P.publicCheck(cafe.id, 0, NOW_DATE), /Party size/);
await assert.rejects(() => P.publicCheck(cafe.id, 11, NOW_DATE), /Party size/);
await assert.rejects(() => P.publicCheck('nope', 2, NOW_DATE), P.PublicCheckinError);
assert.equal((await P.publicCheck(cafe.id, 2, NOW_DATE)).status, 'available');

// A free table: joining makes a self entry with a zero quote.
const j1 = await P.joinWaitingList({ areaId: cafe.id, partySize: 2, phone: '98765 43210', name: '  Asha   Rao ' }, NOW_DATE);
assert.equal(j1.existing, false);
assert.equal(j1.check?.status, 'available');
assert.deepEqual([j1.spot.state, j1.spot.position, j1.spot.quotedWaitMinutes, j1.spot.areaName], ['waiting', 1, 0, 'Cafe']);
const row1 = (await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, j1.spot.id)))[0];
assert.deepEqual([row1.source, row1.guestName, row1.guestPhone, row1.tableId, row1.createdByUserId], ['self', 'Asha Rao', '+919876543210', null, null]);

// The same number again returns the same spot, however it is typed.
const dup = await P.joinWaitingList({ areaId: cafe.id, partySize: 4, phone: '+91 98765-43210' }, NOW_DATE);
assert.deepEqual([dup.existing, dup.spot.id], [true, j1.spot.id]);

// A second guest queues behind the first and the quote follows the people ahead.
const j2 = await P.joinWaitingList({ areaId: cafe.id, partySize: 2, phone: '9111122222' }, NOW_DATE);
assert.equal(j2.spot.position, 2);
assert.equal(j2.check?.status, 'wait', 'with one party ahead it is a wait, not a free table');
assert.equal(j2.spot.quotedWaitMinutes, 15);
assert.equal((await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, j2.spot.id)))[0].guestName, 'Guest ...2222', 'no name given');

// Refused: too big, bad number, and a staff entry's id is never exposed.
await assert.rejects(() => P.joinWaitingList({ areaId: cafe.id, partySize: 10, phone: '9222233333' }, NOW_DATE), (e: unknown) => e instanceof P.PublicCheckinError && e.code === 'too_large');
await assert.rejects(() => P.joinWaitingList({ areaId: cafe.id, partySize: 2, phone: '123' }, NOW_DATE), /WhatsApp/);
const staffRow = await walkIn(null, cafe.id, null);
await assert.rejects(() => P.spotStatus(staffRow, NOW_DATE), (e: unknown) => e instanceof P.PublicCheckinError && e.status === 404);
await assert.rejects(() => P.leaveWaitingList(staffRow, NOW_DATE), (e: unknown) => e instanceof P.PublicCheckinError && e.status === 404);
await assert.rejects(() => P.spotStatus('nope', NOW_DATE), P.PublicCheckinError);

// The long-wait cap refuses to queue.
await S.updateCheckinSettings({ maxWaitMinutes: 10 });
await assert.rejects(() => P.joinWaitingList({ areaId: cafe.id, partySize: 2, phone: '9333344444' }, NOW_DATE), (e: unknown) => e instanceof P.PublicCheckinError && e.code === 'long_wait');
await S.updateCheckinSettings({ maxWaitMinutes: 180 });

// A host notifies, then seats: the guest's state follows; leaving is refused once seated.
await db.update(schema.guestSignIns).set({ notifiedAt: NOW_DATE.toISOString() }).where(eq(schema.guestSignIns.id, j1.spot.id));
assert.equal((await P.spotStatus(j1.spot.id, NOW_DATE)).state, 'ready');
await db.update(schema.guestSignIns).set({ tableId: c4.id }).where(eq(schema.guestSignIns.id, j1.spot.id));
assert.equal((await P.spotStatus(j1.spot.id, NOW_DATE)).state, 'seated');
await assert.rejects(() => P.leaveWaitingList(j1.spot.id, NOW_DATE), /already seated/);

// Leaving frees the spot, and the queue closes up.
const left = await P.leaveWaitingList(j2.spot.id, NOW_DATE);
assert.deepEqual([left.state, left.position], ['left', null]);
assert.equal((await P.leaveWaitingList(j2.spot.id, NOW_DATE)).state, 'left', 'leaving twice is harmless');
const again = await P.joinWaitingList({ areaId: cafe.id, partySize: 2, phone: '9111122222' }, NOW_DATE);
assert.equal(again.existing, false, 'a number that left can join again');

// Menu: shown per area plus the shared sections, hidden items and archived sections left out.
const sec = async (name: string, areaId: string | null, order: number, archived = false) => {
  const id = randomUUID();
  await db.insert(schema.menuSections).values({ id, createdDate: NOW_DATE.toISOString(), areaId, name, sortOrder: order, archivedAt: archived ? NOW_DATE.toISOString() : null });
  return id;
};
const item = (sectionId: string, name: string, price: number, order: number, available = true) =>
  db.insert(schema.menuItems).values({ id: randomUUID(), createdDate: NOW_DATE.toISOString(), sectionId, name, description: null, priceInr: price, sortOrder: order, available });
const hot = await sec('Hot drinks', cafe.id, 1);
const barSec = await sec('Cocktails', bar.id, 2);
const shared = await sec('Desserts', null, 3);
const gone = await sec('Old', cafe.id, 4, true);
const empty = await sec('Empty', cafe.id, 5);
void empty;
await item(hot, 'Cappuccino', 160, 2);
await item(hot, 'Filter coffee', 90, 1);
await item(hot, 'Sold out', 100, 3, false);
await item(barSec, 'Mojito', 380, 1);
await item(shared, 'Brownie', 180, 1);
await item(gone, 'Archived item', 1, 1);
const cafeMenu = await P.publicMenu(cafe.id);
assert.deepEqual(cafeMenu.map((m) => m.name), ['Hot drinks', 'Desserts']);
assert.deepEqual(cafeMenu[0].items.map((i) => i.name), ['Filter coffee', 'Cappuccino'], 'sorted, and the unavailable item is hidden');
assert.deepEqual((await P.publicMenu(bar.id)).map((m) => m.name), ['Cocktails', 'Desserts']);
assert.equal((await P.publicMenu()).length, 3, 'no area: every active section that has items');

// Menu admin: validation, ordering, archive and cascade delete.
const ms = await M.createSection({ name: ' Mains ', areaId: cafe.id });
assert.equal(ms.name, 'Mains', 'name is trimmed');
await assert.rejects(() => M.createSection({ name: '' }), /required/);
await assert.rejects(() => M.createSection({ name: 'X', areaId: 'nope' }), /Unknown area/);
const m1 = await M.createItem(ms.id, { name: 'Pasta', priceInr: 320, description: ' Fresh ' });
const m2 = await M.createItem(ms.id, { name: 'Soup', priceInr: 150 });
assert.equal(m1.description, 'Fresh');
assert.deepEqual([m1.sortOrder, m2.sortOrder], [0, 1]);
await assert.rejects(() => M.createItem(ms.id, { name: 'Bad', priceInr: -1 }), /Price/);
await assert.rejects(() => M.createItem(ms.id, { name: 'Bad', priceInr: 1.5 }), /Price/);
await M.reorder('items', [m2.id, m1.id]);
assert.deepEqual((await M.listMenu()).find((s) => s.id === ms.id)!.items.map((i) => i.name), ['Soup', 'Pasta']);
await assert.rejects(() => M.reorder('items', [m1.id, m1.id]), /once/);
await M.updateItem(m1.id, { available: false });
assert.deepEqual((await P.publicMenu(cafe.id)).find((s) => s.id === ms.id)!.items.map((i) => i.name), ['Soup'], 'hidden item leaves the public menu');
await M.updateSection(ms.id, { archived: true });
assert.equal((await P.publicMenu(cafe.id)).some((s) => s.id === ms.id), false, 'archived section leaves the public menu');
await M.updateSection(ms.id, { archived: false });
await M.deleteSection(ms.id);
assert.equal((await db.select().from(schema.menuItems).where(eq(schema.menuItems.sectionId, ms.id))).length, 0, 'delete cascades');
await assert.rejects(() => M.deleteItem(m1.id), /not found/);

// Rate limiter.
const w = new SlidingWindow(1000, 2);
assert.deepEqual([w.hit('a', 0), w.hit('a', 100), w.hit('a', 200), w.hit('b', 200)], [true, true, false, true]);
assert.equal(w.retryAfter('a', 200), 1);
assert.equal(w.hit('a', 1001), true, 'the window slides');

console.log('checkin checks passed');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
