// Seed the database from src/data/extracted_data.json (the verified Excel
// extraction). Idempotent: wipes and reloads the dataset tables.
//   node db/seed.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(__dirname, '..', '..', 'src', 'data', 'extracted_data.json');

const raw = JSON.parse(fs.readFileSync(DATASET, 'utf-8'));

export async function seed() {
async function insertChunked<T extends { id: unknown }>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  chunk = 1000,
) {
  for (let i = 0; i < rows.length; i += chunk) {
    await db.insert(table).values(rows.slice(i, i + chunk));
  }
}

  await ready();

  await db.transaction(async (tx) => {
  // wipe in FK-safe order
  for (const t of [
    schema.consignmentRecords, schema.salesRecords, schema.financialRecords,
    schema.vendors, schema.channels, schema.categories, schema.lineItems,
    schema.periods, schema.businessUnits, schema.businesses, schema.datasetMeta,
    schema.employees, schema.licences, schema.recruitments, schema.leaveRequests,
  ]) {
    await tx.delete(t);
  }
});

await insertChunked(schema.businesses, raw.businesses);
await insertChunked(schema.businessUnits, raw.businessUnits);
await insertChunked(schema.periods, raw.periods);
await insertChunked(schema.lineItems, raw.lineItems);
await insertChunked(schema.categories, raw.categories);
await insertChunked(schema.channels, raw.channels);
await insertChunked(schema.vendors, raw.vendors);
await insertChunked(schema.financialRecords, raw.financialRecords);
await insertChunked(schema.salesRecords, raw.salesRecords);
await insertChunked(schema.consignmentRecords, raw.consignmentRecords);
await db.insert(schema.datasetMeta).values([{ id: 1, meta: raw._meta }]);

// app entities (all empty today; the previous JSON store's rows would carry over)
const entityMap = [
  ['Employee', schema.employees],
  ['Licence', schema.licences],
  ['Recruitment', schema.recruitments],
  ['LeaveRequest', schema.leaveRequests],
] as const;
for (const [name] of entityMap) {
  const rows = raw.appEntities?.[name] ?? [];
  if (rows.length) {
    throw new Error(
      `appEntities.${name} has ${rows.length} rows - add a field mapping here before seeding them.`,
    );
  }
}

const counts: Record<string, number> = {};
for (const [name, table] of Object.entries({
  businesses: schema.businesses, businessUnits: schema.businessUnits,
  periods: schema.periods, lineItems: schema.lineItems,
  financialRecords: schema.financialRecords, categories: schema.categories,
  channels: schema.channels, salesRecords: schema.salesRecords,
  vendors: schema.vendors, consignmentRecords: schema.consignmentRecords,
})) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  counts[name] = n;
}
console.log('seeded:', counts);
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  await seed();
  process.exit(0);
}
