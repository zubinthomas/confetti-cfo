// Sync one saved sheet source: fetch the xlsx export, run it through the
// normal import pipeline, and leave at most ONE pending preview batch per
// source (a fresh sync supersedes the previous preview). Zero-diff syncs
// record "no_changes" on the source instead of creating an empty batch, and
// workbooks with validation errors never become batches at all - the errors
// are recorded on the source row for the UI to show.
// The source's syncMode decides what happens to the preview: 'manual' leaves
// it for a human to commit; 'auto' commits it immediately - but only when the
// parse produced no warning- or error-level issues ('paused' sources are
// skipped by the scheduler; Sync now still works on them).
import { and, eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { loadWorkbook } from '../import/xlsx.ts';
import { detectKind, PARSERS } from '../import/detect.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import type { Issue } from '../import/types.ts';
import { fetchSheetXlsx } from './fetch.ts';

export type SheetSource = typeof schema.sheetSources.$inferSelect;
type ImportBatch = typeof schema.importBatches.$inferSelect;

export type SyncStatus = 'preview_created' | 'auto_committed' | 'no_changes' | 'error';

export interface SyncResult {
  status: SyncStatus;
  source: SheetSource;
  batch?: ImportBatch;
  error?: string;
}

const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');
/** Auto-commit is stricter than manual commit: warnings also need a human eye. */
export const canAutoCommit = (issues: Issue[]) => issues.every((i) => i.level === 'info');

async function recordOutcome(
  sourceId: number, status: SyncStatus, error: string | null, issues: Issue[] | null = null,
): Promise<SheetSource> {
  const [updated] = await db.update(schema.sheetSources).set({
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: status,
    lastSyncError: error ? error.slice(0, 500) : null,
    lastSyncIssues: issues,
  }).where(eq(schema.sheetSources.id, sourceId)).returning();
  return updated;
}

/**
 * Never throws: failures are recorded on the source row so the scheduler and
 * the UI both see them.
 * @param prefetchedBuffer reuse a buffer already fetched (source creation).
 */
export async function syncSource(source: SheetSource, prefetchedBuffer?: Buffer): Promise<SyncResult> {
  await ready();
  try {
    const buffer = prefetchedBuffer ?? await fetchSheetXlsx(source);
    const wb = await loadWorkbook(buffer);
    const kind = detectKind(wb);
    if (!kind) {
      const msg = 'Unrecognised workbook - expected a CEPL P&L, Cafe Weekly P&L, Sienna Store Sales, HR Mastersheet, FY Target Plan, or Monthly F&B P&L file';
      return { status: 'error', error: msg, source: await recordOutcome(source.id, 'error', msg) };
    }
    const parsed = PARSERS[kind](wb);

    // a fresh sync supersedes any pending preview from this source
    await db.update(schema.importBatches)
      .set({ status: 'discarded' })
      .where(and(
        eq(schema.importBatches.sheetSourceId, source.id),
        eq(schema.importBatches.status, 'preview'),
      ));

    // validation errors reject the sync outright: no batch is stored, the
    // issues land on the source row for the UI to show
    if (hasErrors(parsed.issues)) {
      const errorCount = parsed.issues.filter((i) => i.level === 'error').length;
      const msg = `Validation failed (${errorCount} error${errorCount === 1 ? '' : 's'}) - fix the sheet and sync again`;
      return { status: 'error', error: msg, source: await recordOutcome(source.id, 'error', msg, parsed.issues) };
    }

    const plan = await buildMergePlan(parsed);

    const noChanges = Object.values(plan.stats).every((s) => s.creates + s.updates === 0);
    if (noChanges) {
      return { status: 'no_changes', source: await recordOutcome(source.id, 'no_changes', null) };
    }

    const [batch] = await db.insert(schema.importBatches).values({
      filename: source.label,
      kind,
      status: 'preview',
      uploadedAt: new Date().toISOString(),
      committedAt: null,
      issues: parsed.issues,
      stats: plan.stats,
      details: plan.details,
      payload: parsed,
      sourceType: 'sheet',
      sheetSourceId: source.id,
    }).returning();

    if (source.syncMode === 'auto' && canAutoCommit(parsed.issues)) {
      await commitMergePlan(plan);
      const [committed] = await db.update(schema.importBatches).set({
        status: 'committed',
        committedAt: new Date().toISOString(),
      }).where(eq(schema.importBatches.id, batch.id)).returning();
      return { status: 'auto_committed', batch: committed, source: await recordOutcome(source.id, 'auto_committed', null) };
    }

    return { status: 'preview_created', batch, source: await recordOutcome(source.id, 'preview_created', null) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`sheets: sync failed for source ${source.id} (${source.label}):`, msg);
    return { status: 'error', error: msg, source: await recordOutcome(source.id, 'error', msg) };
  }
}
