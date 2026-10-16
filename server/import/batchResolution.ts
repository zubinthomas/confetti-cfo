// Shared dedup/auto-resolution logic used by every batch-creating path
// (routes/import.ts POST /upload, sheets/sync.ts, tally/sync.ts). Keeps the
// review queue from filling up with exact repeats of a change a human has
// already rejected, or with more than one pending preview per sync source.
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { db as defaultDb, schema } from '../db/client.ts';

type Db = typeof defaultDb;

interface PrecedentQuery {
  kind: string;
  sourceType: string;
  sheetSourceId: number | null;
  tallySourceId: number | null;
  contentHash: string;
}

/** True if a human has already discarded this exact change (same kind,
 *  source, and content hash) at some point in the past - a brand new batch
 *  that matches should auto-discard rather than ask again. */
export async function findManuallyRejectedPrecedent(db: Db, q: PrecedentQuery): Promise<boolean> {
  const [row] = await db.select({ id: schema.importBatches.id })
    .from(schema.importBatches)
    .where(and(
      eq(schema.importBatches.kind, q.kind),
      eq(schema.importBatches.sourceType, q.sourceType),
      q.sheetSourceId == null ? isNull(schema.importBatches.sheetSourceId) : eq(schema.importBatches.sheetSourceId, q.sheetSourceId),
      q.tallySourceId == null ? isNull(schema.importBatches.tallySourceId) : eq(schema.importBatches.tallySourceId, q.tallySourceId),
      eq(schema.importBatches.contentHash, q.contentHash),
      eq(schema.importBatches.status, 'discarded'),
      eq(schema.importBatches.decisionSource, 'manual'),
    ))
    .limit(1);
  return row != null;
}

type SourceRef =
  | { sourceType: 'sheet'; sheetSourceId: number; kind: string }
  | { sourceType: 'tally'; tallySourceId: number; kind: string };

/** Discards any other still-pending preview of the same kind from the same
 *  sheet/Tally source, so a source never has more than one open preview of
 *  that kind at a time. Scoped by `kind` (not just source) because a single
 *  Tally source now pushes two independent kinds of batch per cycle
 *  ('tally' financial records and 'bills' - server/tally/sync.ts) - without
 *  this, resolving one kind's sync would wrongly discard the other kind's
 *  still-open preview. `excludeIds` keeps this sync cycle's own
 *  freshly-inserted batches safe - a single Tally push can produce one
 *  batch per business for financial records, and those siblings must not
 *  supersede each other. Not applicable to manual uploads, which have no
 *  persistent source row to key off. */
export async function supersedePendingForSource(db: Db, ref: SourceRef, excludeIds: number[]): Promise<void> {
  const sourceCondition = ref.sourceType === 'sheet'
    ? eq(schema.importBatches.sheetSourceId, ref.sheetSourceId)
    : eq(schema.importBatches.tallySourceId, ref.tallySourceId);
  await db.update(schema.importBatches)
    .set({ status: 'discarded', decisionSource: 'auto_discard_superseded' })
    .where(and(
      eq(schema.importBatches.sourceType, ref.sourceType),
      eq(schema.importBatches.kind, ref.kind),
      sourceCondition,
      eq(schema.importBatches.status, 'preview'),
      notInArray(schema.importBatches.id, excludeIds),
    ));
}
