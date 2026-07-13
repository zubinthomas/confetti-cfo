// Load the full dataset (the database-backed copy of the Excel extraction)
// in the exact shape of src/data/extracted_data.json's tables. Used by
// GET /api/dataset and by db/verify.ts.
import { asc } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export async function loadDataset() {
  await ready();
  return {
    businesses: await db.select().from(schema.businesses).orderBy(asc(schema.businesses.id)),
    businessUnits: await db.select().from(schema.businessUnits).orderBy(asc(schema.businessUnits.id)),
    periods: await db.select().from(schema.periods).orderBy(asc(schema.periods.id)),
    lineItems: await db.select().from(schema.lineItems).orderBy(asc(schema.lineItems.id)),
    financialRecords: await db.select().from(schema.financialRecords).orderBy(asc(schema.financialRecords.id)),
    categories: await db.select().from(schema.categories).orderBy(asc(schema.categories.id)),
    channels: await db.select().from(schema.channels).orderBy(asc(schema.channels.id)),
    salesRecords: await db.select().from(schema.salesRecords).orderBy(asc(schema.salesRecords.id)),
    vendors: await db.select().from(schema.vendors).orderBy(asc(schema.vendors.id)),
    consignmentRecords: await db.select().from(schema.consignmentRecords).orderBy(asc(schema.consignmentRecords.id)),
  };
}

export async function loadMeta() {
  await ready();
  const rows = await db.select().from(schema.datasetMeta);
  return rows[0]?.meta ?? null;
}
