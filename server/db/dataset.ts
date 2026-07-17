// Load the full dataset (the database-backed copy of the Excel extraction)
// in the exact shape of src/data/extracted_data.json's tables. Used by
// db/verify.ts and import/verify-import.ts (CLI verification scripts) - the
// dashboard itself only ever fetches filtered slices (see reference.ts /
// financialRecords.ts / salesRecords.ts / consignmentRecords.ts), composed
// here with no filters for the full-dataset verify case.
import { db, ready, schema } from './client.ts';
import { loadReferenceData } from './reference.ts';
import { listFinancialRecords } from './financialRecords.ts';
import { listSalesRecords } from './salesRecords.ts';
import { listConsignmentRecords } from './consignmentRecords.ts';

export async function loadDataset() {
  await ready();
  const reference = await loadReferenceData();
  return {
    ...reference,
    financialRecords: await listFinancialRecords({}),
    salesRecords: await listSalesRecords({}),
    consignmentRecords: await listConsignmentRecords({}),
  };
}

export async function loadMeta() {
  await ready();
  const rows = await db.select().from(schema.datasetMeta);
  return rows[0]?.meta ?? null;
}
