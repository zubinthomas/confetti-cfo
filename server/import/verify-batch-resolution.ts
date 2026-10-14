// Proves computeContentHash is order-independent but content-sensitive, and
// that findManuallyRejectedPrecedent / supersedePendingForSource (the
// dedup/auto-resolution logic behind the import review UI rework) do what
// their names say against a real database.
//   node import/verify-batch-resolution.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { FieldChange } from './types.ts';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
process.env.PGLITE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-resolution-verify-pg-'));

const { computeContentHash } = await import('./contentHash.ts');
const { findManuallyRejectedPrecedent, supersedePendingForSource } = await import('./batchResolution.ts');
const { ready, db, schema } = await import('../db/client.ts');
const { eq } = await import('drizzle-orm');

const valueField = (from: unknown, to: unknown): FieldChange[] => [{ field: 'value', from, to }];

await ready();

// Foreign-key targets for the tallySourceId values used below.
const [source1, source2, source42, source43] = await db.insert(schema.tallySources).values([
  { label: 'Source 1', apiKeyHash: 'x', createdAt: new Date().toISOString() },
  { label: 'Source 2', apiKeyHash: 'x', createdAt: new Date().toISOString() },
  { label: 'Source 42', apiKeyHash: 'x', createdAt: new Date().toISOString() },
  { label: 'Source 43', apiKeyHash: 'x', createdAt: new Date().toISOString() },
]).returning();

// ── computeContentHash: order-independent ──────────────────────────────────
{
  const a = {
    financialRecords: [
      { action: 'create' as const, description: 'B', fields: valueField(null, 1) },
      { action: 'update' as const, description: 'A', fields: valueField(1, 2) },
    ],
  };
  const b = {
    financialRecords: [
      { action: 'update' as const, description: 'A', fields: valueField(1, 2) },
      { action: 'create' as const, description: 'B', fields: valueField(null, 1) },
    ],
  };
  assert.equal(computeContentHash(a), computeContentHash(b), 'reordering tables/changes must not change the hash');
}

// ── computeContentHash: content-sensitive ───────────────────────────────────
{
  const a = { financialRecords: [{ action: 'create' as const, description: 'B', fields: valueField(null, 1) }] };
  const b = { financialRecords: [{ action: 'create' as const, description: 'B', fields: valueField(null, 2) }] };
  assert.notEqual(computeContentHash(a), computeContentHash(b), 'a genuinely different value must hash differently');
}

// ── computeContentHash: null/empty details ──────────────────────────────────
{
  assert.equal(computeContentHash(null), computeContentHash(undefined), 'null and undefined details must hash the same (both empty)');
  assert.equal(computeContentHash({}), computeContentHash(null), 'an empty object and null must hash the same');
}

function baseBatch(overrides: Partial<typeof schema.importBatches.$inferInsert>): typeof schema.importBatches.$inferInsert {
  return {
    filename: 'test.xlsx', kind: 'tally', status: 'preview' as const,
    uploadedAt: new Date().toISOString(), committedAt: null,
    issues: [], stats: {}, details: null, payload: {},
    sourceType: 'tally', sheetSourceId: null, tallySourceId: source1.id,
    ...overrides,
  };
}

// ── findManuallyRejectedPrecedent ───────────────────────────────────────────
{
  const hash = 'deadbeef';
  await db.insert(schema.importBatches).values(baseBatch({
    status: 'discarded', decisionSource: 'manual', contentHash: hash,
  }));

  const matches = await findManuallyRejectedPrecedent(db, {
    kind: 'tally', sourceType: 'tally', sheetSourceId: null, tallySourceId: source1.id, contentHash: hash,
  });
  assert.equal(matches, true, 'an identical manually-discarded batch must count as precedent');

  const differentHash = await findManuallyRejectedPrecedent(db, {
    kind: 'tally', sourceType: 'tally', sheetSourceId: null, tallySourceId: source1.id, contentHash: 'other-hash',
  });
  assert.equal(differentHash, false, 'a different content hash must not match');

  const differentSource = await findManuallyRejectedPrecedent(db, {
    kind: 'tally', sourceType: 'tally', sheetSourceId: null, tallySourceId: source2.id, contentHash: hash,
  });
  assert.equal(differentSource, false, 'a different tally source must not match');

  await db.insert(schema.importBatches).values(baseBatch({
    status: 'discarded', decisionSource: 'auto_discard_noop', contentHash: 'auto-only-hash',
  }));
  const autoOnly = await findManuallyRejectedPrecedent(db, {
    kind: 'tally', sourceType: 'tally', sheetSourceId: null, tallySourceId: source1.id, contentHash: 'auto-only-hash',
  });
  assert.equal(autoOnly, false, 'an auto-discarded (not manually-discarded) batch must not count as precedent');
}

// ── supersedePendingForSource ───────────────────────────────────────────────
{
  const [older] = await db.insert(schema.importBatches).values(baseBatch({
    tallySourceId: source42.id, status: 'preview', contentHash: 'older',
  })).returning();
  const [newer] = await db.insert(schema.importBatches).values(baseBatch({
    tallySourceId: source42.id, status: 'preview', contentHash: 'newer',
  })).returning();
  const [otherSource] = await db.insert(schema.importBatches).values(baseBatch({
    tallySourceId: source43.id, status: 'preview', contentHash: 'unrelated',
  })).returning();

  await supersedePendingForSource(db, { sourceType: 'tally', tallySourceId: source42.id }, [newer.id]);

  const [olderAfter] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, older.id));
  assert.equal(olderAfter.status, 'discarded', 'the older pending preview from the same source must be superseded');
  assert.equal(olderAfter.decisionSource, 'auto_discard_superseded');

  const [newerAfter] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, newer.id));
  assert.equal(newerAfter.status, 'preview', 'the excluded batch itself must be left alone');

  const [otherAfter] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, otherSource.id));
  assert.equal(otherAfter.status, 'preview', 'a pending preview from a different source must be left alone');
}

console.log('OK - computeContentHash and batchResolution behave as expected.');
