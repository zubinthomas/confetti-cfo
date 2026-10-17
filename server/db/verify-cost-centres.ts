// DB-level checks for the cost-centre master against a throwaway PGlite dir:
// the CHECK/unique constraints, the idempotent seed (including that it never
// overwrites a reassignment), and the assign/exclude/clear operations.
//   node db/verify-cost-centres.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-centres-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const { applyCostCentreSeed, COST_CENTRES } = await import('./seed-cost-centres.ts');
const { getOverview, assignMember, excludeMember, clearMember, CostCentreError } = await import('./costCentres.ts');
const { loadReferenceData } = await import('./reference.ts');
const { and, eq } = await import('drizzle-orm');

await ready();
const now = new Date().toISOString();

// ── Fixture: a slice of the real shape. "Bar Find" is deliberately absent so
// the seed has something to report as not found. ─────────────────────────────
// The audit column on a membership is a real FK, so the acting user must exist (id 1).
await db.insert(schema.users).values({ email: 'verify@example.com', passwordHash: 'x', createdAt: now });
await db.insert(schema.businesses).values([
  { id: 1, name: 'CEPL', slug: 'cepl', description: 'x' },
  { id: 2, name: 'Cafe', slug: 'cafe', description: 'x' },
  { id: 3, name: 'Sienna', slug: 'sienna', description: 'x' },
]);
const cepl = ['Bosar Ghor', 'Dining Room', 'Bar', 'Rannaghor', 'Event', 'Catering', 'Pottery', 'Batik', 'Stitching',
  'Balance Sheet', 'Profit & Loss', 'Store', 'Trading Items', 'Midweek', 'F&B'];
const cafe = ['Bosar Ghor', 'Dinning Room', 'Rannaghor', 'Total', 'Cafe'];
let nextId = 1;
const unitRows = [
  ...cepl.map((name) => ({ id: nextId++, businessId: 1, name, unitType: 'outlet' as const })),
  ...cafe.map((name) => ({ id: nextId++, businessId: 2, name, unitType: 'department' as const })),
];
await db.insert(schema.businessUnits).values(unitRows);
await db.insert(schema.channels).values([{ id: 1, businessId: 3, name: 'HP Store' }]);
await db.insert(schema.vendors).values([{ id: 1, businessId: 3, name: 'Some Brand', commissionRate: 0.2, group: 'consignment' }]);
const unitId = (business: number, name: string) => unitRows.find((u) => u.businessId === business && u.name === name)!.id;

const rejects = async (label: string, fn: () => Promise<unknown>) => {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  assert.ok(threw, `${label} should have been rejected`);
};

// ── Seed ─────────────────────────────────────────────────────────────────────
const first = await applyCostCentreSeed();
assert.equal(first.centresCreated.length, COST_CENTRES.length, 'all seven centres created');
assert.deepEqual(first.notFound, ['CEPL / Bar Find'], 'a missing unit is reported, not created');
assert.equal(first.membersCreated.length, 12 + 3, '12 memberships (13 minus the missing Bar Find) plus 3 exclusions');
assert.equal((await db.select().from(schema.businessUnits)).length, unitRows.length, 'the seed never creates units');

const second = await applyCostCentreSeed();
assert.equal(second.centresCreated.length, 0, 're-run creates no centres');
assert.equal(second.membersCreated.length, 0, 're-run creates no memberships');
assert.equal(second.alreadyDecided.length, first.membersCreated.length, 're-run leaves every decided unit alone');

// ── Overview: only decided units are placed; the open ones are Unassigned ────
let ov = await getOverview();
const byCode = (code: string) => ov.centres.find((c) => c.code === code)!;
assert.deepEqual(byCode('CC-HFB').members.map((m) => m.name).sort(),
  ['CEPL / Bar', 'CEPL / Bosar Ghor', 'CEPL / Dining Room', 'Cafe / Bosar Ghor', 'Cafe / Dinning Room']);
assert.deepEqual(byCode('CC-CEV').members.map((m) => m.name).sort(),
  ['CEPL / Catering', 'CEPL / Event', 'CEPL / Rannaghor', 'Cafe / Rannaghor']);
assert.deepEqual(byCode('CC-CRF').members.map((m) => m.name).sort(),
  ['CEPL / Batik', 'CEPL / Pottery', 'CEPL / Stitching']);
for (const code of ['CC-RTL', 'CC-SPN', 'CC-SHS', 'CC-CPX']) assert.equal(byCode(code).members.length, 0, `${code} has no members yet`);
assert.deepEqual(ov.excluded.map((e) => e.name).sort(), ['CEPL / Balance Sheet', 'CEPL / Profit & Loss', 'Cafe / Total']);
assert.ok(ov.excluded.every((e) => e.reason.length > 0));
assert.deepEqual(ov.unassigned.map((u) => u.name).sort(),
  ['CEPL / F&B', 'CEPL / Midweek', 'CEPL / Store', 'CEPL / Trading Items', 'Cafe / Cafe', 'Sienna / HP Store', 'Sienna / Some Brand']);

// ── Database constraints ─────────────────────────────────────────────────────
const hfb = byCode('CC-HFB').id;
await rejects('a row with two targets', () => db.insert(schema.costCentreMembers).values({
  costCentreId: hfb, businessUnitId: unitId(1, 'Store'), channelId: 1, createdAt: now }));
await rejects('a row with no target', () => db.insert(schema.costCentreMembers).values({ costCentreId: hfb, createdAt: now }));
await rejects('a row that is both a member and excluded', () => db.insert(schema.costCentreMembers).values({
  costCentreId: hfb, exclusionReason: 'x', businessUnitId: unitId(1, 'Store'), createdAt: now }));
await rejects('a row that is neither a member nor excluded', () => db.insert(schema.costCentreMembers).values({
  businessUnitId: unitId(1, 'Store'), createdAt: now }));
await rejects('a second row for the same unit', () => db.insert(schema.costCentreMembers).values({
  costCentreId: hfb, businessUnitId: unitId(1, 'Bar'), createdAt: now }));

// ── assign / exclude / clear ─────────────────────────────────────────────────
const cev = byCode('CC-CEV').id;
const rtl = byCode('CC-RTL').id;
await assignMember(1, { kind: 'businessUnit', targetId: unitId(1, 'Midweek'), costCentreId: hfb });
await assignMember(1, { kind: 'businessUnit', targetId: unitId(1, 'Midweek'), costCentreId: cev }); // moves it
ov = await getOverview();
assert.ok(byCode('CC-CEV').members.some((m) => m.name === 'CEPL / Midweek'), 'assigning again moves the unit');
assert.ok(!byCode('CC-HFB').members.some((m) => m.name === 'CEPL / Midweek'), 'and removes it from the old centre');

await assignMember(1, { kind: 'channel', targetId: 1, costCentreId: rtl });
await assignMember(1, { kind: 'vendor', targetId: 1, costCentreId: rtl });
ov = await getOverview();
assert.deepEqual(byCode('CC-RTL').members.map((m) => m.name).sort(), ['Sienna / HP Store', 'Sienna / Some Brand']);

await excludeMember(1, { kind: 'businessUnit', targetId: unitId(1, 'F&B'), reason: 'Aggregate of the venue columns' });
ov = await getOverview();
assert.ok(ov.excluded.some((e) => e.name === 'CEPL / F&B' && e.reason === 'Aggregate of the venue columns'));

const storeRow = await excludeMember(1, { kind: 'businessUnit', targetId: unitId(1, 'Store'), reason: 'temp' });
await clearMember(storeRow.id);
ov = await getOverview();
assert.ok(ov.unassigned.some((u) => u.name === 'CEPL / Store'), 'clearing returns a unit to undecided');

await rejects('an exclusion without a reason', () => excludeMember(1, { kind: 'businessUnit', targetId: unitId(1, 'Store'), reason: '  ' }));
await assert.rejects(() => assignMember(1, { kind: 'businessUnit', targetId: unitId(1, 'Store'), costCentreId: 9999 }), CostCentreError);
await assert.rejects(() => assignMember(1, { kind: 'businessUnit', targetId: 9999, costCentreId: hfb }), CostCentreError);
await assert.rejects(() => assignMember(1, { kind: 'nonsense', targetId: 1, costCentreId: hfb }), CostCentreError);
await assert.rejects(() => clearMember(999999), CostCentreError);

await db.update(schema.costCentres).set({ isActive: false }).where(eq(schema.costCentres.id, byCode('CC-SPN').id));
await assert.rejects(() => assignMember(1, { kind: 'businessUnit', targetId: unitId(1, 'Store'), costCentreId: byCode('CC-SPN').id }), CostCentreError);

// ── The seed must never overwrite a reassignment made after it ───────────────
await assignMember(1, { kind: 'businessUnit', targetId: unitId(1, 'Bosar Ghor'), costCentreId: cev });
await applyCostCentreSeed();
const [bosar] = await db.select().from(schema.costCentreMembers)
  .where(and(eq(schema.costCentreMembers.businessUnitId, unitId(1, 'Bosar Ghor'))));
assert.equal(bosar.costCentreId, cev, 're-running the seed keeps a manual reassignment');

// ── Reference data carries the mapping ───────────────────────────────────────
const ref = await loadReferenceData();
assert.equal(ref.costCentres.length, COST_CENTRES.length);
assert.ok(ref.costCentreMembers.length > 0);
assert.ok(!('createdByUserId' in ref.costCentreMembers[0]), 'reference data leaves out audit columns');

fs.rmSync(dir, { recursive: true, force: true });
console.log('verify-cost-centres: OK');
process.exit(0);
