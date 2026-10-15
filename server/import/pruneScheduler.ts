// Periodically deletes old, fully auto-resolved import_batches rows - no
// human judgment was ever involved in these, and nothing reads them back by
// content (see batchResolution.ts: findManuallyRejectedPrecedent only
// matches decisionSource 'manual', supersedePendingForSource only touches
// 'preview' rows). 'manual' discards are deliberately never pruned here -
// findManuallyRejectedPrecedent relies on them staying around indefinitely
// to avoid re-surfacing a change someone already rejected.
//
// In-process, same as sheets/scheduler.ts and for the same reason: PGlite is
// single-process, so an external cron/worker could never share the database
// with the server anyway.
import { lt, and, inArray } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';

const FIRST_RUN_DELAY_MS = 60_000;
const PRUNABLE_REASONS = ['auto_discard_noop', 'auto_discard_duplicate_rejected', 'auto_discard_superseded'] as const;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return; // skip overlapping runs
  inFlight = true;
  try {
    await ready();
    const days = Number(process.env.IMPORT_BATCH_RETENTION_DAYS ?? 30);
    if (!Number.isFinite(days) || days <= 0) return;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const deleted = await db.delete(schema.importBatches)
      .where(and(
        inArray(schema.importBatches.decisionSource, PRUNABLE_REASONS),
        lt(schema.importBatches.uploadedAt, cutoff),
      )).returning({ id: schema.importBatches.id });
    if (deleted.length) console.log(`import: pruned ${deleted.length} auto-discarded batch(es) older than ${days}d`);
  } catch (err) {
    console.error('import: batch prune tick failed:', err);
  } finally {
    inFlight = false;
  }
}

export function startImportBatchPruneScheduler(): void {
  const days = Number(process.env.IMPORT_BATCH_RETENTION_DAYS ?? 30);
  if (!Number.isFinite(days) || days <= 0) {
    console.log('import: batch pruning disabled (IMPORT_BATCH_RETENTION_DAYS is 0 or invalid)');
    return;
  }
  console.log(`import: pruning auto-discarded batches older than ${days}d, checked daily`);
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  setInterval(tick, 24 * 60 * 60_000).unref();
}
