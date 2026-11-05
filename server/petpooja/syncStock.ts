// Turn one PetPooja Item Stock On/Off webhook call into a ParsedWorkbook-
// shaped batch and run it through the normal import pipeline - modeled
// directly on syncMenu.ts/syncSales.ts. Never throws: failures are recorded
// on the source row, same contract as every other sync here.
//
// Writes outcomes to petpoojaSources' lastStockSync* columns, not the
// lastSync*/lastMenuSync* ones Sales/Menu already own - same collision
// syncMenu.ts's own header comment predicted for itself.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import { canAutoCommit } from '../sheets/sync.ts';
import { computeContentHash } from '../import/contentHash.ts';
import { findManuallyRejectedPrecedent, supersedePendingForSource } from '../import/batchResolution.ts';
import type { Issue, ParsedPetpoojaStockPayload, ParsedWorkbook } from '../import/types.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;
type ImportBatch = typeof schema.importBatches.$inferSelect;
export type PetpoojaStockSyncStatus = 'preview_created' | 'auto_committed' | 'no_changes' | 'auto_discarded' | 'error';

export interface PetpoojaStockSyncResult {
  status: PetpoojaStockSyncStatus;
  source: PetpoojaSource;
  batch: ImportBatch | null;
  error?: string;
}

async function recordStockSyncOutcome(
  sourceId: number, status: PetpoojaStockSyncStatus, error: string | null, issues: Issue[] | null,
): Promise<PetpoojaSource> {
  const [updated] = await db.update(schema.petpoojaSources).set({
    lastStockSyncAt: new Date().toISOString(),
    lastStockSyncStatus: status,
    lastStockSyncError: error ? error.slice(0, 500) : null,
    lastStockSyncIssues: issues,
  }).where(eq(schema.petpoojaSources.id, sourceId)).returning();
  return updated;
}

export async function syncPetpoojaStock(source: PetpoojaSource, payload: ParsedPetpoojaStockPayload, issues: Issue[]): Promise<PetpoojaStockSyncResult> {
  await ready();
  const label = `${source.label} (stock ${payload.type} ${payload.inStock ? 'on' : 'off'}, ${payload.itemIds.length} id${payload.itemIds.length === 1 ? '' : 's'})`;
  try {
    const parsed: ParsedWorkbook = {
      kind: 'petpoojaStock',
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
      petpoojaStockPayload: payload,
      petpoojaOrderCallbackPayload: null,
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
        kind: 'petpoojaStock',
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
        source: await recordStockSyncOutcome(source.id, 'no_changes', null, issues.length ? issues : null),
      };
    }

    const rejectedBefore = await findManuallyRejectedPrecedent(db, {
      kind: 'petpoojaStock', sourceType: 'petpooja', sheetSourceId: null, tallySourceId: null, petpoojaSourceId: source.id, contentHash,
    });
    if (rejectedBefore) {
      const [batch] = await db.insert(schema.importBatches).values({
        filename: label,
        kind: 'petpoojaStock',
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
        source: await recordStockSyncOutcome(source.id, 'auto_discarded', null, issues.length ? issues : null),
      };
    }

    const [batch] = await db.insert(schema.importBatches).values({
      filename: label,
      kind: 'petpoojaStock',
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
    await supersedePendingForSource(db, { sourceType: 'petpooja', petpoojaSourceId: source.id, kind: 'petpoojaStock' }, [batch.id]);

    if (source.syncMode === 'auto' && canAutoCommit(issues)) {
      await commitMergePlan(plan);
      const [committed] = await db.update(schema.importBatches).set({
        status: 'committed', committedAt: new Date().toISOString(), decisionSource: 'auto_commit',
      }).where(eq(schema.importBatches.id, batch.id)).returning();
      return {
        status: 'auto_committed', batch: committed,
        source: await recordStockSyncOutcome(source.id, 'auto_committed', null, issues.length ? issues : null),
      };
    }
    return {
      status: 'preview_created', batch,
      source: await recordStockSyncOutcome(source.id, 'preview_created', null, issues.length ? issues : null),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`petpooja: stock sync failed for source ${source.id} (${source.label}):`, msg);
    return {
      status: 'error', batch: null, error: msg,
      source: await recordStockSyncOutcome(source.id, 'error', msg, null),
    };
  }
}
