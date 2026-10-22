// Checks the reservation catalogue seed against a throwaway PGlite dir: fresh
// startup defaults, the table counts per area, idempotence, and that an edited
// table (capacity) or an unrelated table survives a re-run.
//   node db/verify-reservation-seed.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reservation-seed-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const { applyReservationTableSeed, DEFAULT_CAPACITY, TABLES_BY_AREA } = await import('./seed-reservation-tables.ts');
const { DEFAULT_AREAS, DEFAULT_LOCATION } = await import('./reservationCatalog.ts');
const { createTable, listAreas, listLocations, createLocation, createArea, ReservationError } = await import('./reservations.ts');
const { eq } = await import('drizzle-orm');

await ready(); // migrations + startup defaults

// Fresh database: the startup seed made the location and the four areas.
let locations = await listLocations();
assert.deepEqual(locations.map((l) => l.name), [DEFAULT_LOCATION]);
let areas = await listAreas();
assert.deepEqual(areas.map((a) => a.name).sort(), DEFAULT_AREAS.map((a) => a.name).sort());
const floorOf = new Map(areas.map((a) => [a.name, a.floor]));
assert.equal(floorOf.get('Cafe'), 'Ground Floor');
assert.equal(floorOf.get('Restaurant'), 'First Floor');
assert.equal(floorOf.get('Bar'), 'First Floor');
assert.equal(floorOf.get('Second Floor'), null);
assert.equal(floorOf.get('Curbside'), null);

const tableRows = async () => db.select({
  name: schema.reservationTables.name, area: schema.reservationAreas.name, capacity: schema.reservationTables.capacity,
}).from(schema.reservationTables)
  .innerJoin(schema.reservationAreas, eq(schema.reservationAreas.id, schema.reservationTables.areaId));

// First run: 29 tables, 9 / 10 / 6 / 0 / 4 (Curbside bays seat 1), nothing but the startup rows created otherwise.
const first = await applyReservationTableSeed();
assert.equal(first.locationCreated, false);
assert.deepEqual(first.areasCreated, []);
let rows = await tableRows();
const count = (area: string) => rows.filter((r) => r.area === area).length;
assert.equal(rows.length, 29);
assert.deepEqual([count('Cafe'), count('Restaurant'), count('Bar'), count('Second Floor'), count('Curbside')], [9, 10, 6, 0, 4]);
assert.ok(rows.filter((r) => r.area !== 'Curbside').every((r) => r.capacity === DEFAULT_CAPACITY));
assert.ok(rows.filter((r) => r.area === 'Curbside').every((r) => r.capacity === 1));
assert.ok(!rows.some((r) => r.name === 'C1' && r.area === 'Cafe'), 'C1 belongs to Curbside, not Cafe');
for (const [area, names] of Object.entries(TABLES_BY_AREA)) {
  assert.deepEqual(rows.filter((r) => r.area === area).map((r) => r.name).sort(), [...names].sort(), area);
}
// Excluded on purpose.
assert.ok(!rows.some((r) => /KOT/i.test(r.name)), 'N. C KOT must not be seeded');
assert.ok(!rows.some((r) => /swiggy|zomato|delivery/i.test(r.name)));

// Second run: nothing new.
const second = await applyReservationTableSeed();
assert.deepEqual(second.tablesCreated, {});
assert.equal(second.tablesKept, 29);
assert.equal((await tableRows()).length, 29);

// An edited capacity survives, and a table outside the list is left alone and reported.
const [t1] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.name, 'BAR 1'));
await db.update(schema.reservationTables).set({ capacity: 2 }).where(eq(schema.reservationTables.id, t1.id));
const cafe = areas.find((a) => a.name === 'Cafe')!;
await createTable({ areaId: cafe.id, name: 'Default', capacity: 4 });
const third = await applyReservationTableSeed();
assert.deepEqual(third.tablesCreated, {});
assert.deepEqual(third.otherTables, { Cafe: ['Default'] });
rows = await tableRows();
assert.equal(rows.find((r) => r.name === 'BAR 1')!.capacity, 2);
assert.equal(rows.length, 30);

// Missing pieces come back: delete Bar's tables and the Bar area, re-seed.
await db.delete(schema.reservationTables).where(eq(schema.reservationTables.areaId, areas.find((a) => a.name === 'Bar')!.id));
await db.delete(schema.reservationAreas).where(eq(schema.reservationAreas.name, 'Bar'));
const fourth = await applyReservationTableSeed();
assert.deepEqual(fourth.areasCreated, ['Bar']);
assert.equal(fourth.tablesCreated.Bar.length, 6);

// Hierarchy guards: a location with areas, and an area with tables, can't be archived by the
// API helpers, and names are unique per parent.
const { archiveLocation, archiveArea, archiveTable, listTables } = await import('./reservations.ts');
const [loc] = await listLocations();
await assert.rejects(() => archiveLocation(loc.id), ReservationError);
await assert.rejects(() => archiveArea(cafe.id), ReservationError);
await assert.rejects(() => createArea({ locationId: loc.id, name: 'Cafe' }), ReservationError);
const other = await createLocation({ name: 'Second Venue' });
const sameName = await createArea({ locationId: other.id, name: 'Cafe', floor: 'Ground Floor' }); // same name, different location: ok
assert.equal(sameName.name, 'Cafe');
await assert.rejects(() => createLocation({ name: 'Second Venue' }), ReservationError);

// An archived table is a deliberate retirement: re-running the seed must not bring it back.
const cafeTables = await listTables({ areaId: cafe.id });
const retiredTable = cafeTables.find((t) => t.name === 'T2')!;
await archiveTable(retiredTable.id);
const fifth = await applyReservationTableSeed();
assert.deepEqual(fifth.tablesCreated, {}, 'seed recreated an archived table');
assert.deepEqual(fifth.retired, ['Cafe / T2']);
assert.ok(!(await listTables({ areaId: cafe.id })).some((t) => t.name === 'T2'));

console.log('reservation seed verify: all checks passed');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(`${dir}.lock`, { force: true });
process.exit(0);
