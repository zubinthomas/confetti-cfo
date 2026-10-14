// One-off backfill: computes content_hash for every existing import_batches
// row that doesn't have one yet, so the import review UI's grouping (which
// keys on content_hash) collapses historical clutter too, not just batches
// created after this feature shipped. A batch with no `details` (it predates
// that column) is left with a null hash - it naturally stays its own
// ungroupable singleton rather than risk mis-grouping.
//
// Run once per database: `node db/backfill-import-batch-hashes.ts` with the
// server stopped first (PGlite is single-process - see client.ts). Safe to
// re-run - it only touches rows where content_hash IS NULL.
import { isNull, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { computeContentHash } from '../import/contentHash.ts';

async function main() {
  await ready();

  const rows = await db.select({ id: schema.importBatches.id, details: schema.importBatches.details })
    .from(schema.importBatches)
    .where(isNull(schema.importBatches.contentHash));

  let hashed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.details == null) {
      skipped += 1;
      continue;
    }
    const contentHash = computeContentHash(row.details);
    await db.update(schema.importBatches).set({ contentHash }).where(eq(schema.importBatches.id, row.id));
    hashed += 1;
  }

  console.log(`Done. ${hashed} batch(es) hashed, ${skipped} skipped (no details column).`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
