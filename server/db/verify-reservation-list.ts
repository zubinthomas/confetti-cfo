// Checks the paged "All reservations" query (listReservationPage) against a
// throwaway PGlite dir: filters, search (wildcards are literal), ordering,
// totals, stable paging and input validation.
//   node db/verify-reservation-list.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reservation-list-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const { listAreas, createTable, listReservationPage, ReservationError } = await import('./reservations.ts');

await ready();
const areas = await listAreas();
const cafe = areas.find((a) => a.name === 'Cafe')!;
const bar = areas.find((a) => a.name === 'Bar')!;
const tCafe = await createTable({ areaId: cafe.id, name: 'L1', capacity: 4 });
const tBar = await createTable({ areaId: bar.id, name: 'L2', capacity: 4 });

type Status = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
let n = 0;
const add = (tableId: string, date: string, time: string, guestName: string, status: Status = 'confirmed', guestPhone: string | null = null) =>
  db.insert(schema.reservations).values({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    createdDate: new Date().toISOString(),
    tableId, date, time, durationMinutes: 60, partySize: 2, guestName, guestPhone, status,
  });

await add(tCafe.id, '2026-10-01', '12:00', 'Asha Rao', 'completed', '98300 11111');
await add(tCafe.id, '2026-10-20', '19:00', 'Bilal Khan', 'cancelled');
await add(tCafe.id, '2026-10-22', '13:00', 'Chitra 100% Sen', 'confirmed', '98300 22222');
await add(tBar.id, '2026-10-22', '13:00', 'Dev_Anand', 'pending');
await add(tBar.id, '2026-10-22', '20:00', 'Devaanand', 'seated');
await add(tBar.id, '2026-11-05', '18:00', 'Esha Gupta', 'confirmed');

const names = (r: { rows: { guestName: string }[] }) => r.rows.map((x) => x.guestName);

// Everything, both directions.
let page = await listReservationPage({});
assert.equal(page.total, 6);
assert.deepEqual(names(page), ['Asha Rao', 'Bilal Khan', 'Chitra 100% Sen', 'Dev_Anand', 'Devaanand', 'Esha Gupta']);
page = await listReservationPage({ order: 'desc' });
assert.deepEqual(names(page), ['Esha Gupta', 'Devaanand', 'Chitra 100% Sen', 'Dev_Anand', 'Bilal Khan', 'Asha Rao']);

// Date range is inclusive at both ends.
page = await listReservationPage({ from: '2026-10-20', to: '2026-10-22' });
assert.equal(page.total, 4);
page = await listReservationPage({ from: '2026-10-22', to: '2026-10-22' });
assert.equal(page.total, 3);
page = await listReservationPage({ from: '2026-10-23' });
assert.deepEqual(names(page), ['Esha Gupta']);
page = await listReservationPage({ to: '2026-10-21', order: 'desc' });
assert.deepEqual(names(page), ['Bilal Khan', 'Asha Rao']);

// Status and area.
assert.equal((await listReservationPage({ status: 'confirmed' })).total, 2);
assert.equal((await listReservationPage({ status: 'no_show' })).total, 0);
assert.equal((await listReservationPage({ areaId: bar.id })).total, 3);
assert.equal((await listReservationPage({ areaId: cafe.id, status: 'confirmed' })).total, 1);

// Search: name, phone, case-insensitive; % and _ are literal.
assert.deepEqual(names(await listReservationPage({ q: 'asha' })), ['Asha Rao']);
assert.deepEqual(names(await listReservationPage({ q: '22222' })), ['Chitra 100% Sen']);
assert.deepEqual(names(await listReservationPage({ q: '100%' })), ['Chitra 100% Sen']);
assert.equal((await listReservationPage({ q: '%' })).total, 1);
assert.deepEqual(names(await listReservationPage({ q: 'dev_' })), ['Dev_Anand']);
assert.equal((await listReservationPage({ q: '  ' })).total, 6, 'blank search is no filter');

// Paging: total is the full match count, pages are disjoint and cover everything in order.
const seen: string[] = [];
for (let offset = 0; offset < 6; offset += 4) {
  const p = await listReservationPage({ limit: 4, offset });
  assert.equal(p.total, 6);
  seen.push(...names(p));
}
assert.deepEqual(seen, ['Asha Rao', 'Bilal Khan', 'Chitra 100% Sen', 'Dev_Anand', 'Devaanand', 'Esha Gupta']);
// Same date+time (Chitra 13:00 vs Dev_Anand 13:00) must not swap between page boundaries.
const a = await listReservationPage({ limit: 1, offset: 2 });
const b = await listReservationPage({ limit: 1, offset: 3 });
assert.notEqual(names(a)[0], names(b)[0]);
assert.equal((await listReservationPage({ limit: 4, offset: 100 })).rows.length, 0);
assert.equal((await listReservationPage({ limit: 0 })).rows.length, 6, 'limit 0 falls back to the default');
assert.equal((await listReservationPage({ limit: 1000 })).rows.length, 6, 'limit is clamped, not rejected');

// Rows carry the joined names.
page = await listReservationPage({ q: 'esha' });
assert.equal(page.rows[0].areaName, 'Bar');
assert.equal(page.rows[0].tableName, 'L2');

// Validation.
for (const bad of [{ from: '22/10/2026' }, { to: '2026-1-1' }, { status: 'late' }, { order: 'sideways' }]) {
  await assert.rejects(() => listReservationPage(bad), ReservationError);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('reservation list: ok');
process.exit(0);
