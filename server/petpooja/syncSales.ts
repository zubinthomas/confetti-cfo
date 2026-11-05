// Turn one PetPooja Sales API webhook call into a ParsedWorkbook-shaped
// batch and run it through the normal import pipeline - modeled directly on
// server/tally/sync.ts's syncTallyBillsPush (one order per call here, one
// bill-wise snapshot per cycle there, but the same no-op/duplicate-reject/
// auto-commit shape applies either way). Never throws: failures are recorded
// on the source row, same contract as every other sync in this codebase.
//
// Unlike syncTallyBillsPush (which deliberately never touches tallySources'
// lastSyncAt/lastSyncStatus/lastSyncError/lastSyncIssues, since Tally's
// financial-records sync already owns those columns as its contract), this
// DOES record onto petpoojaSources' equivalent columns - those were built in
// step 2 "unused until step 3", and Sales is the only sync kind touching
// petpoojaSources so far, so there's no clobbering risk yet. If a later step
// (Menu/Stock) also wants outcome tracking on the same source row, it will
// need the same "don't record" carve-out Tally's bills sync uses.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import { canAutoCommit } from '../sheets/sync.ts';
import { computeContentHash } from '../import/contentHash.ts';
import { findManuallyRejectedPrecedent, supersedePendingForSource } from '../import/batchResolution.ts';
import type { Issue, ParsedPetpoojaSalesRecord, ParsedWorkbook } from '../import/types.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;
type ImportBatch = typeof schema.importBatches.$inferSelect;
export type PetpoojaSalesSyncStatus = 'preview_created' | 'auto_committed' | 'no_changes' | 'auto_discarded' | 'error';

export interface PetpoojaSalesSyncResult {
  status: PetpoojaSalesSyncStatus;
  source: PetpoojaSource;
  batch: ImportBatch | null;
  error?: string;
}

async function recordOutcome(
  sourceId: number, status: PetpoojaSalesSyncStatus, error: string | null, issues: Issue[] | null,
): Promise<PetpoojaSource> {
  const [updated] = await db.update(schema.petpoojaSources).set({
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: status,
    lastSyncError: error ? error.slice(0, 500) : null,
    lastSyncIssues: issues,
  }).where(eq(schema.petpoojaSources.id, sourceId)).returning();
  return updated;
}

export async function syncPetpoojaSales(source: PetpoojaSource, record: ParsedPetpoojaSalesRecord, issues: Issue[]): Promise<PetpoojaSalesSyncResult> {
  await ready();
  try {
    const parsed: ParsedWorkbook = {
      kind: 'petpoojaSales',
      businessName: '',
      periods: [],
      financialRecords: [],
      salesRecords: [],
      consignmentRecords: [],
      employeeRecords: [],
      targetRecords: [],
      productionLogRecords: [],
      shiftRosterRecords: [],
      orderRecords: [],
      billRecords: [],
      petpoojaSalesRecords: [record],
      petpoojaMenuPayload: null, petpoojaStockPayload: null, petpoojaOrderCallbackPayload: null,
      compliancePaymentRecords: [],
      complianceDocumentRecords: [],
      complianceTrademarkRecords: [],
      complianceDirectorRecords: [],
      issues,
    };

    const plan = await buildMergePlan(parsed);
    const contentHash = computeContentHash(plan.details);
    const noChanges = Object.values(plan.details).every((d) => d.length === 0);

    if (noChanges) {
      const [batch] = await db.insert(schema.importBatches).values({
        filename: `${source.label} (order ${record.orderId})`,
        kind: 'petpoojaSales',
        status: 'discarded',
        uploadedAt: new Date().toISOString(),
        committedAt: null,
        issues,
        stats: plan.stats,
        details: null,
        payload: null,
        sourceType: 'petpooja',
        petpoojaSourceId: source.id,
        contentHash,
        decisionSource: 'auto_discard_noop',
      }).returning();
      return {
        status: 'no_changes', batch,
        source: await recordOutcome(source.id, 'no_changes', null, issues.length ? issues : null),
      };
    }

    const rejectedBefore = await findManuallyRejectedPrecedent(db, {
      kind: 'petpoojaSales', sourceType: 'petpooja', sheetSourceId: null, tallySourceId: null, petpoojaSourceId: source.id, contentHash,
    });
    if (rejectedBefore) {
      const [batch] = await db.insert(schema.importBatches).values({
        filename: `${source.label} (order ${record.orderId})`,
        kind: 'petpoojaSales',
        status: 'discarded',
        uploadedAt: new Date().toISOString(),
        committedAt: null,
        issues,
        stats: plan.stats,
        details: plan.details,
        payload: null,
        sourceType: 'petpooja',
        petpoojaSourceId: source.id,
        contentHash,
        decisionSource: 'auto_discard_duplicate_rejected',
      }).returning();
      return {
        status: 'auto_discarded', batch,
        source: await recordOutcome(source.id, 'auto_discarded', null, issues.length ? issues : null),
      };
    }

    const [batch] = await db.insert(schema.importBatches).values({
      filename: `${source.label} (order ${record.orderId})`,
      kind: 'petpoojaSales',
      status: 'preview',
      uploadedAt: new Date().toISOString(),
      committedAt: null,
      issues,
      stats: plan.stats,
      details: plan.details,
      payload: parsed,
      sourceType: 'petpooja',
      petpoojaSourceId: source.id,
      contentHash,
    }).returning();
    await supersedePendingForSource(db, { sourceType: 'petpooja', petpoojaSourceId: source.id, kind: 'petpoojaSales' }, [batch.id]);

    if (source.syncMode === 'auto' && canAutoCommit(issues)) {
      await commitMergePlan(plan);
      const [committed] = await db.update(schema.importBatches).set({
        status: 'committed', committedAt: new Date().toISOString(), decisionSource: 'auto_commit',
      }).where(eq(schema.importBatches.id, batch.id)).returning();
      return {
        status: 'auto_committed', batch: committed,
        source: await recordOutcome(source.id, 'auto_committed', null, issues.length ? issues : null),
      };
    }
    return {
      status: 'preview_created', batch,
      source: await recordOutcome(source.id, 'preview_created', null, issues.length ? issues : null),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`petpooja: sales sync failed for source ${source.id} (${source.label}):`, msg);
    return {
      status: 'error', batch: null, error: msg,
      source: await recordOutcome(source.id, 'error', msg, null),
    };
  }
}
