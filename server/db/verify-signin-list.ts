// Checks the paged guest-register query (listSignInPage) against a throwaway
// PGlite dir: state, IST day bounds, filters, search (wildcards are literal,
// table names match), stable paging and input validation.
//   node db/verify-signin-list.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signin-list-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const { listAreas, createTable } = await import('./reservations.ts');
const { listSignInPage, GuestSignInError } = await import('./guestSignIns.ts');
const { randomUUID } = await import('node:crypto');

await ready();
const areas = await listAreas();
const cafe = areas.find((a) => a.name === 'Cafe')!;
const bar = areas.find((a) => a.name === 'Bar')!;
const chef = await createTable({ areaId: cafe.id, name: "Chef's Table", capacity: 4 });
const stool = await createTable({ areaId: bar.id, name: 'Stool 1', capacity: 2 });

type Row = { guestName: string; at: string; out?: boolean; areaId?: string; tableId?: string | null; visitType?: 'walk_in' | 'event'; phone?: string; host?: string };
const add = (r: Row) => db.insert(schema.guestSignIns).values({
  id: randomUUID(), createdDate: r.at, guestName: r.guestName, visitType: r.visitType ?? 'walk_in', partySize: 2,
  areaId: r.areaId ?? cafe.id, tableId: r.tableId ?? null, guestPhone: r.phone ?? null, host: r.host ?? null,
  signedInAt: r.at, signedOutAt: r.out === false ? null : r.at,
});

await add({ guestName: 'Asha Rao', at: '2026-10-20T10:00:00Z', tableId: chef.id, phone: '98300 11111' });
await add({ guestName: 'Bilal 100% Khan', at: '2026-10-21T18:29:00Z' });                      // 23:59 IST on the 21st
await add({ guestName: 'Chitra Sen', at: '2026-10-21T18:30:00Z', tableId: stool.id, areaId: bar.id }); // 00:00 IST on the 22nd
await add({ guestName: 'Dev_Anand', at: '2026-10-22T05:00:00Z', visitType: 'event', host: 'Meera Iyer' });
await add({ guestName: 'Esha Gupta', at: '2026-10-22T06:00:00Z', out: false, tableId: chef.id }); // still on premises
await add({ guestName: 'Farid Ali', at: '2026-10-22T07:00:00Z', tableId: chef.id });

const names = (p: { rows: { guestName: string }[] }) => p.rows.map((r) => r.guestName);

// Default is signed-out only, newest first.
let page = await listSignInPage({});
assert.equal(page.total, 5);
assert.deepEqual(names(page), ['Farid Ali', 'Dev_Anand', 'Chitra Sen', 'Bilal 100% Khan', 'Asha Rao']);
page = await listSignInPage({ state: 'onPremises' });
assert.deepEqual(names(page), ['Esha Gupta']);

// IST day bounds, inclusive at both ends.
assert.deepEqual(names(await listSignInPage({ from: '2026-10-22', to: '2026-10-22' })), ['Farid Ali', 'Dev_Anand', 'Chitra Sen']);
assert.deepEqual(names(await listSignInPage({ from: '2026-10-21', to: '2026-10-21' })), ['Bilal 100% Khan']);
assert.deepEqual(names(await listSignInPage({ to: '2026-10-20' })), ['Asha Rao']);
assert.deepEqual(names(await listSignInPage({ from: '2026-10-23' })), []);

// Filters.
assert.equal((await listSignInPage({ tableId: chef.id })).total, 2, 'on-premises Esha is excluded from the signed-out view');
assert.equal((await listSignInPage({ tableId: chef.id, state: 'onPremises' })).total, 1);
assert.deepEqual(names(await listSignInPage({ areaId: bar.id })), ['Chitra Sen']);
assert.deepEqual(names(await listSignInPage({ visitType: 'event' })), ['Dev_Anand']);

// Search: name, phone, host, table name; case-insensitive; % and _ are literal.
assert.deepEqual(names(await listSignInPage({ q: 'asha' })), ['Asha Rao']);
assert.deepEqual(names(await listSignInPage({ q: '11111' })), ['Asha Rao']);
assert.deepEqual(names(await listSignInPage({ q: 'meera' })), ['Dev_Anand']);
assert.deepEqual(names(await listSignInPage({ q: "chef's" })), ['Farid Ali', 'Asha Rao']);
assert.deepEqual(names(await listSignInPage({ q: '100%' })), ['Bilal 100% Khan']);
assert.equal((await listSignInPage({ q: '%' })).total, 1);
assert.deepEqual(names(await listSignInPage({ q: 'dev_' })), ['Dev_Anand']);
assert.equal((await listSignInPage({ q: '  ' })).total, 5, 'blank search is no filter');

// Paging.
const seen: string[] = [];
for (let offset = 0; offset < 5; offset += 2) {
  const p = await listSignInPage({ limit: 2, offset });
  assert.equal(p.total, 5);
  seen.push(...names(p));
}
assert.deepEqual(seen, ['Farid Ali', 'Dev_Anand', 'Chitra Sen', 'Bilal 100% Khan', 'Asha Rao']);
assert.equal((await listSignInPage({ limit: 2, offset: 100 })).rows.length, 0);
assert.equal((await listSignInPage({ limit: 1000 })).rows.length, 5, 'limit is clamped, not rejected');

// Rows carry the joined names.
const row = (await listSignInPage({ q: 'farid' })).rows[0];
assert.equal(row.tableName, "Chef's Table");
assert.equal(row.areaName, 'Cafe');

// Validation.
for (const bad of [{ from: '22/10/2026' }, { to: '2026-1-1' }, { visitType: 'vip' }, { state: 'gone' }]) {
  await assert.rejects(() => listSignInPage(bad), GuestSignInError);
}

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(`${dir}.lock`, { force: true });
console.log('sign-in list: ok');
process.exit(0);
