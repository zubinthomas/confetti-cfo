// Turn one PetPooja Menu Push webhook call (or Fetch Menu response, via
// fetchMenu.ts) into a ParsedWorkbook-shaped batch and run it through the
// normal import pipeline - modeled directly on syncSales.ts (and, through
// it, server/tally/sync.ts's syncTallyBillsPush). Never throws: failures
// are recorded on the source row, same contract as every other sync here.
//
// Writes outcomes to petpoojaSources' lastMenuSync* columns, not the
// lastSync*/lastSyncStatus/... ones Sales already owns - see syncSales.ts's
// own header comment, which predicted exactly this collision.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import { canAutoCommit } from '../sheets/sync.ts';
import { computeContentHash } from '../import/contentHash.ts';
import { findManuallyRejectedPrecedent, supersedePendingForSource } from '../import/batchResolution.ts';
import type { Issue, ParsedPetpoojaMenuPayload, ParsedWorkbook } from '../import/types.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;
type ImportBatch = typeof schema.importBatches.$inferSelect;
export type PetpoojaMenuSyncStatus = 'preview_created' | 'auto_committed' | 'no_changes' | 'auto_discarded' | 'error';

export interface PetpoojaMenuSyncResult {
  status: PetpoojaMenuSyncStatus;
  source: PetpoojaSource;
  batch: ImportBatch | null;
  error?: string;
}

// Exported for fetchMenu.ts's resyncPetpoojaMenu, which needs to record the
// same kind of outcome on a parse failure that happens before there's a
// payload to hand to syncPetpoojaMenu at all.
export async function recordMenuSyncOutcome(
  sourceId: number, status: PetpoojaMenuSyncStatus, error: string | null, issues: Issue[] | null,
): Promise<PetpoojaSource> {
  const [updated] = await db.update(schema.petpoojaSources).set({
    lastMenuSyncAt: new Date().toISOString(),
    lastMenuSyncStatus: status,
    lastMenuSyncError: error ? error.slice(0, 500) : null,
    lastMenuSyncIssues: issues,
  }).where(eq(schema.petpoojaSources.id, sourceId)).returning();
  return updated;
}

export async function syncPetpoojaMenu(source: PetpoojaSource, payload: ParsedPetpoojaMenuPayload, issues: Issue[]): Promise<PetpoojaMenuSyncResult> {
  await ready();
  const label = `${source.label} (menu ${payload.sourceKind})`;
  try {
    const parsed: ParsedWorkbook = {
      kind: 'petpoojaMenu',
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
      petpoojaMenuPayload: payload,
      petpoojaStockPayload: null, petpoojaOrderCallbackPayload: null,
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
        kind: 'petpoojaMenu',
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
        source: await recordMenuSyncOutcome(source.id, 'no_changes', null, issues.length ? issues : null),
      };
    }

    const rejectedBefore = await findManuallyRejectedPrecedent(db, {
      kind: 'petpoojaMenu', sourceType: 'petpooja', sheetSourceId: null, tallySourceId: null, petpoojaSourceId: source.id, contentHash,
    });
    if (rejectedBefore) {
      const [batch] = await db.insert(schema.importBatches).values({
        filename: label,
        kind: 'petpoojaMenu',
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
        source: await recordMenuSyncOutcome(source.id, 'auto_discarded', null, issues.length ? issues : null),
      };
    }

    const [batch] = await db.insert(schema.importBatches).values({
      filename: label,
      kind: 'petpoojaMenu',
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
    await supersedePendingForSource(db, { sourceType: 'petpooja', petpoojaSourceId: source.id, kind: 'petpoojaMenu' }, [batch.id]);

    if (source.syncMode === 'auto' && canAutoCommit(issues)) {
      await commitMergePlan(plan);
      const [committed] = await db.update(schema.importBatches).set({
        status: 'committed', committedAt: new Date().toISOString(), decisionSource: 'auto_commit',
      }).where(eq(schema.importBatches.id, batch.id)).returning();
      return {
        status: 'auto_committed', batch: committed,
        source: await recordMenuSyncOutcome(source.id, 'auto_committed', null, issues.length ? issues : null),
      };
    }
    return {
      status: 'preview_created', batch,
      source: await recordMenuSyncOutcome(source.id, 'preview_created', null, issues.length ? issues : null),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`petpooja: menu sync failed for source ${source.id} (${source.label}):`, msg);
    return {
      status: 'error', batch: null, error: msg,
      source: await recordMenuSyncOutcome(source.id, 'error', msg, null),
    };
  }
}
