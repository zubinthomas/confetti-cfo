// Proves buildMergePlan totals, rather than collides on, multiple parsed
// financial records that resolve to the same (unit, period, lineItem) key
// within one batch. Normal parsers never produce that - one spreadsheet cell
// is one record - but a Tally sync fans a group-mapped line item out across
// every ledger under that group, each pushed as its own record for the same
// period. Without this, buildMergePlan staged a duplicate-key insert per
// extra ledger and financial_records_natural_key rejected the commit.
//   node import/verify-financial-aggregation.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
process.env.PGLITE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-agg-verify-pg-'));

const { buildMergePlan, commitMergePlan } = await import('./merge.ts');
const { ready, db, schema } = await import('../db/client.ts');
const { eq } = await import('drizzle-orm');

await ready();

function workbook(records: { lineItemName: string; value: number }[]) {
  return {
    kind: 'cepl',
    businessName: 'Agg Test Co',
    periods: [],
    financialRecords: records.map((r) => ({
      businessName: 'Agg Test Co', unitName: 'Main Unit', unitType: 'department' as const,
      periodStart: '2026-10-01', periodEnd: '2026-10-01', periodType: 'custom' as const,
      lineItemName: r.lineItemName, valueType: 'amount' as const, value: r.value,
    })),
    salesRecords: [], consignmentRecords: [], employeeRecords: [], targetRecords: [],
    productionLogRecords: [], shiftRosterRecords: [], orderRecords: [], issues: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ── three ledgers fanned into the same line item in one batch must total ───
{
  const plan = await buildMergePlan(workbook([
    { lineItemName: 'Electricity Charges', value: 100 },
    { lineItemName: 'Electricity Charges', value: 250 },
    { lineItemName: 'Electricity Charges', value: 64.5 },
  ]));
  assert.equal(plan.stats.financialRecords.creates, 1, 'three colliding records must stage exactly one create');
  const detail = plan.details.financialRecords.find((d) => d.description.includes('Electricity Charges'));
  assert.equal(detail?.fields?.[0]?.to, 414.5, 'the staged value must be the sum, not the last record seen');
  await commitMergePlan(plan);

  const [row] = await db.select().from(schema.lineItems).where(eq(schema.lineItems.name, 'Electricity Charges'));
  const [fin] = await db.select().from(schema.financialRecords).where(eq(schema.financialRecords.lineItemId, row.id));
  assert.equal(fin.value, 414.5, 'the committed row must hold the summed total');
  console.log('ok - three colliding records in one batch commit as a single summed row');
}

// ── a second sync with a different ledger mix must update to the new total ─
{
  const plan = await buildMergePlan(workbook([
    { lineItemName: 'Electricity Charges', value: 100 },
    { lineItemName: 'Electricity Charges', value: 300 },
  ]));
  assert.equal(plan.stats.financialRecords.updates, 1, 're-sync with a changed total must stage an update, not a second create');
  await commitMergePlan(plan);
  const [row] = await db.select().from(schema.lineItems).where(eq(schema.lineItems.name, 'Electricity Charges'));
  const [fin] = await db.select().from(schema.financialRecords).where(eq(schema.financialRecords.lineItemId, row.id));
  assert.equal(fin.value, 400, 'the row must now hold the new summed total');
  console.log('ok - re-sync with a changed ledger mix updates to the new sum');
}

// ── an unrelated line item in the same batch is untouched by the fan-in ────
{
  const plan = await buildMergePlan(workbook([
    { lineItemName: 'Electricity Charges', value: 400 }, // unchanged from above
    { lineItemName: 'Rent & Rates', value: 50 },
  ]));
  assert.equal(plan.stats.financialRecords.unchanged, 1, 'the unchanged line item must not be re-staged');
  assert.equal(plan.stats.financialRecords.creates, 1, 'the new, distinct line item must still create normally');
  console.log('ok - aggregation only merges records that actually share a key');
}

console.log('financial-record aggregation checks passed (3 cases)');
process.exit(0);
