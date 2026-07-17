// The small "dimension" tables: rarely change, cheap to load in full. Kept
// separate from the big fact tables (financialRecords/salesRecords/
// consignmentRecords - see financialRecords.ts et al.) so the client can load
// this once at boot instead of the whole dataset (see GET /api/reference).
import { asc } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export async function loadReferenceData() {
  await ready();
  return {
    businesses: await db.select().from(schema.businesses).orderBy(asc(schema.businesses.id)),
    businessUnits: await db.select().from(schema.businessUnits).orderBy(asc(schema.businessUnits.id)),
    periods: await db.select().from(schema.periods).orderBy(asc(schema.periods.id)),
    lineItems: await db.select().from(schema.lineItems).orderBy(asc(schema.lineItems.id)),
    categories: await db.select().from(schema.categories).orderBy(asc(schema.categories.id)),
    channels: await db.select().from(schema.channels).orderBy(asc(schema.channels.id)),
    vendors: await db.select().from(schema.vendors).orderBy(asc(schema.vendors.id)),
  };
}
