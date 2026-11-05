// Turn one PetPooja Order Callback webhook call into a ParsedWorkbook-
// shaped batch and run it through the normal import pipeline - modeled
// directly on syncStock.ts/syncMenu.ts. Never throws: failures are
// recorded on the source row, same contract as every other sync here.
//
// Writes outcomes to petpoojaSources' lastOrderCallbackSync* columns, not
// the lastSync*/lastMenuSync*/lastStockSync* ones Sales/Menu/Stock already
// own - same collision each of those already predicted for itself.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import { canAutoCommit } from '../sheets/sync.ts';
import { computeContentHash } from '../import/contentHash.ts';
import { findManuallyRejectedPrecedent, supersedePendingForSource } from '../import/batchResolution.ts';
import type { Issue, ParsedPetpoojaOrderCallbackPayload, ParsedWorkbook } from '../import/types.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;
type ImportBatch = typeof schema.importBatches.$inferSelect;
export type PetpoojaOrderCallbackSyncStatus = 'preview_created' | 'auto_committed' | 'no_changes' | 'auto_discarded' | 'error';

export interface PetpoojaOrderCallbackSyncResult {
  status: PetpoojaOrderCallbackSyncStatus;
  source: PetpoojaSource;
  batch: ImportBatch | null;
  error?: string;
}

async function recordOrderCallbackSyncOutcome(
  sourceId: number, status: PetpoojaOrderCallbackSyncStatus, error: string | null, issues: Issue[] | null,
): Promise<PetpoojaSource> {
  const [updated] = await db.update(schema.petpoojaSources).set({
    lastOrderCallbackSyncAt: new Date().toISOString(),
    lastOrderCallbackSyncStatus: status,
    lastOrderCallbackSyncError: error ? error.slice(0, 500) : null,
    lastOrderCallbackSyncIssues: issues,
  }).where(eq(schema.petpoojaSources.id, sourceId)).returning();
  return updated;
}

export async function syncPetpoojaOrderCallback(source: PetpoojaSource, payload: ParsedPetpoojaOrderCallbackPayload, issues: Issue[]): Promise<PetpoojaOrderCallbackSyncResult> {
  await ready();
  const label = `${source.label} (order callback ${payload.orderId})`;
  try {
    const parsed: ParsedWorkbook = {
      kind: 'petpoojaOrderCallback',
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
      petpoojaSalesRecords: [],
      petpoojaMenuPayload: null,
      petpoojaStockPayload: null,
      petpoojaOrderCallbackPayload: payload,
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
        filename: label,
        kind: 'petpoojaOrderCallback',
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
        source: await recordOrderCallbackSyncOutcome(source.id, 'no_changes', null, issues.length ? issues : null),
      };
    }

    const rejectedBefore = await findManuallyRejectedPrecedent(db, {
      kind: 'petpoojaOrderCallback', sourceType: 'petpooja', sheetSourceId: null, tallySourceId: null, petpoojaSourceId: source.id, contentHash,
    });
    if (rejectedBefore) {
      const [batch] = await db.insert(schema.importBatches).values({
        filename: label,
        kind: 'petpoojaOrderCallback',
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
        source: await recordOrderCallbackSyncOutcome(source.id, 'auto_discarded', null, issues.length ? issues : null),
      };
    }

    const [batch] = await db.insert(schema.importBatches).values({
      filename: label,
      kind: 'petpoojaOrderCallback',
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
    await supersedePendingForSource(db, { sourceType: 'petpooja', petpoojaSourceId: source.id, kind: 'petpoojaOrderCallback' }, [batch.id]);

    if (source.syncMode === 'auto' && canAutoCommit(issues)) {
      await commitMergePlan(plan);
      const [committed] = await db.update(schema.importBatches).set({
        status: 'committed', committedAt: new Date().toISOString(), decisionSource: 'auto_commit',
      }).where(eq(schema.importBatches.id, batch.id)).returning();
      return {
        status: 'auto_committed', batch: committed,
        source: await recordOrderCallbackSyncOutcome(source.id, 'auto_committed', null, issues.length ? issues : null),
      };
    }
    return {
      status: 'preview_created', batch,
      source: await recordOrderCallbackSyncOutcome(source.id, 'preview_created', null, issues.length ? issues : null),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`petpooja: order callback sync failed for source ${source.id} (${source.label}):`, msg);
    return {
      status: 'error', batch: null, error: msg,
      source: await recordOrderCallbackSyncOutcome(source.id, 'error', msg, null),
    };
  }
}
