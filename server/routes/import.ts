// Workbook import: upload → validation preview → commit / discard.
// The parsed workbook is stored on the batch row, so commit replays it against
// the CURRENT database state (a fresh merge plan) inside one transaction.
import { Router } from 'express';
import multer from 'multer';
import { eq, desc } from 'drizzle-orm';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { db, ready, schema } from '../db/client.ts';
import { loadWorkbook } from '../import/xlsx.ts';
import { detectKind, PARSERS } from '../import/detect.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import { computeContentHash } from '../import/contentHash.ts';
import { addNewUnitWarning } from '../import/newUnitWarning.ts';
import { findManuallyRejectedPrecedent } from '../import/batchResolution.ts';
import type { Issue, ParsedWorkbook } from '../import/types.ts';

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');

// Exactly the columns this needs - lets callers select a narrowed row (see
// GET /batches below) without pulling the heavy payload/details JSONB
// columns through Drizzle just to discard them here.
type BatchSummaryInput = Pick<typeof schema.importBatches.$inferSelect,
  'id' | 'filename' | 'kind' | 'status' | 'uploadedAt' | 'committedAt' | 'issues' | 'stats'
  | 'sourceType' | 'sheetSourceId' | 'tallySourceId' | 'contentHash' | 'decisionSource'>;

// also used by routes/sheets.ts and tallyAgent.ts - keeps the heavy parsed
// payload out of responses. sourceStale is only ever computed by GET
// /batches below (the one response path dashboard KPI cards actually read
// via useImportFreshness) - every other caller here returns a batch right
// after its own upload/commit/discard action, where staleness isn't a
// meaningful thing to report, so it defaults to null (not applicable).
export const batchSummary = (b: BatchSummaryInput, decidedByEmail: string | null = null, sourceStale: boolean | null = null) => ({
  id: b.id, filename: b.filename, kind: b.kind, status: b.status,
  uploadedAt: b.uploadedAt, committedAt: b.committedAt,
  issues: b.issues, stats: b.stats,
  sourceType: b.sourceType, sheetSourceId: b.sheetSourceId, tallySourceId: b.tallySourceId,
  contentHash: b.contentHash, decisionSource: b.decisionSource, decidedByEmail, sourceStale,
});

// A Tally-sourced batch is stale once its source has gone quiet for 5x its
// own configured sync interval - loose enough that a single slow/retried
// cycle doesn't false-positive, while still catching an agent that's really
// been down a while. Non-Tally batches (upload/sheet) have no heartbeat
// concept, hence null rather than false - "not applicable," not "fresh."
function computeSourceStale(sourceType: string, lastSeenAt: string | null, syncIntervalMinutes: number | null, now: number): boolean | null {
  if (sourceType !== 'tally') return null;
  if (lastSeenAt == null) return true;
  const intervalMs = (syncIntervalMinutes ?? 15) * 60 * 1000;
  return now - new Date(lastSeenAt).getTime() > 5 * intervalMs;
}

/** POST /api/import/upload - parse + validate a workbook, store a preview batch. */
router.post('/upload', requirePermission('Import', 'write'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    await ready();
    const wb = await loadWorkbook(req.file.buffer);
    const kind = detectKind(wb);
    if (!kind) {
      return res.status(400).json({
        message: 'Unrecognised workbook - expected a CEPL P&L, Cafe Weekly P&L, Sienna Store Sales, HR Mastersheet, FY Target Plan, Monthly F&B P&L, Weekly F&B P&L, or a client Order Status workbook',
      });
    }
    const parsed = PARSERS[kind](wb);
    // validation errors reject the upload outright: no batch is stored, the
    // client shows the issues as an informational card instead of a preview
    if (hasErrors(parsed.issues)) {
      return res.status(422).json({
        message: 'Validation failed - nothing was imported',
        filename: req.file.originalname,
        kind,
        issues: parsed.issues,
      });
    }
    // preview merge plan against the current database (not committed)
    const plan = await buildMergePlan(parsed);
    addNewUnitWarning(parsed, plan);
    const contentHash = computeContentHash(plan.details);
    const noChanges = Object.values(plan.stats).every((s) => s.creates + s.updates === 0);
    const rejectedBefore = !noChanges && await findManuallyRejectedPrecedent(db, {
      kind, sourceType: 'upload', sheetSourceId: null, tallySourceId: null, contentHash,
    });
    const [batch] = await db.insert(schema.importBatches).values({
      filename: req.file.originalname,
      kind,
      status: noChanges || rejectedBefore ? 'discarded' : 'preview',
      uploadedAt: new Date().toISOString(),
      committedAt: null,
      issues: parsed.issues,
      stats: plan.stats,
      // A no-op batch's details are structurally all-empty (noChanges means
      // nothing was pushed to any table's diff); a duplicate-rejected batch
      // still has a real diff worth keeping for "View full details". Neither
      // auto-discarded case can ever reach POST /:id/commit (requires
      // status === 'preview'), so payload is never needed again for either.
      details: noChanges ? null : plan.details,
      payload: noChanges || rejectedBefore ? null : parsed,
      contentHash,
      decisionSource: noChanges ? 'auto_discard_noop' : rejectedBefore ? 'auto_discard_duplicate_rejected' : null,
    }).returning();
    res.status(201).json(batchSummary(batch));
  } catch (err) {
    console.error('import upload error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Import failed' });
  }
});

/** GET /api/import/batches - newest first, without payloads. */
router.get('/batches', requirePermission('Import', 'read'), async (_req, res) => {
  await ready();
  const rows = await db.select({
    id: schema.importBatches.id,
    filename: schema.importBatches.filename,
    kind: schema.importBatches.kind,
    status: schema.importBatches.status,
    uploadedAt: schema.importBatches.uploadedAt,
    committedAt: schema.importBatches.committedAt,
    issues: schema.importBatches.issues,
    stats: schema.importBatches.stats,
    sourceType: schema.importBatches.sourceType,
    sheetSourceId: schema.importBatches.sheetSourceId,
    tallySourceId: schema.importBatches.tallySourceId,
    contentHash: schema.importBatches.contentHash,
    decisionSource: schema.importBatches.decisionSource,
    decidedByEmail: schema.users.email,
    tallyLastSeenAt: schema.tallySources.lastSeenAt,
    tallySyncIntervalMinutes: schema.tallySources.syncIntervalMinutes,
  }).from(schema.importBatches)
    .leftJoin(schema.users, eq(schema.users.id, schema.importBatches.decidedByUserId))
    .leftJoin(schema.tallySources, eq(schema.tallySources.id, schema.importBatches.tallySourceId))
    .orderBy(desc(schema.importBatches.id));
  const now = Date.now();
  res.json(rows.map((r) => batchSummary(
    r, r.decidedByEmail,
    computeSourceStale(r.sourceType, r.tallyLastSeenAt, r.tallySyncIntervalMinutes, now),
  )));
});

/** POST /api/import/:id/commit */
router.post('/:id/commit', requirePermission('Import', 'write'), async (req: AuthedRequest, res) => {
  try {
    await ready();
    const id = Number(req.params.id);
    const [batch] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, id));
    if (!batch) return res.status(404).json({ message: 'Not found' });
    if (batch.status !== 'preview') return res.status(409).json({ message: `Batch is already ${batch.status}` });
    const parsed = batch.payload as ParsedWorkbook;
    if (hasErrors(parsed.issues)) {
      return res.status(400).json({ message: 'This workbook has validation errors and cannot be committed' });
    }
    const plan = await buildMergePlan(parsed); // fresh, against current db state
    await commitMergePlan(plan);
    const [updated] = await db.update(schema.importBatches).set({
      status: 'committed',
      committedAt: new Date().toISOString(),
      stats: plan.stats,
      details: plan.details,
      contentHash: computeContentHash(plan.details),
      decisionSource: 'manual',
      decidedByUserId: req.user!.id,
    }).where(eq(schema.importBatches.id, id)).returning();
    res.json(batchSummary(updated, req.user!.email));
  } catch (err) {
    console.error('import commit error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Commit failed' });
  }
});

/** GET /api/import/:id/details - full row-level change details for one batch. */
router.get('/:id/details', requirePermission('Import', 'read'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const [batch] = await db.select({ details: schema.importBatches.details })
    .from(schema.importBatches).where(eq(schema.importBatches.id, id));
  if (!batch) return res.status(404).json({ message: 'Not found' });
  res.json({ details: batch.details ?? null });
});

/** POST /api/import/:id/discard */
router.post('/:id/discard', requirePermission('Import', 'delete'), async (req: AuthedRequest, res) => {
  await ready();
  const id = Number(req.params.id);
  const [batch] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, id));
  if (!batch) return res.status(404).json({ message: 'Not found' });
  if (batch.status !== 'preview') return res.status(409).json({ message: `Batch is already ${batch.status}` });
  const [updated] = await db.update(schema.importBatches)
    .set({ status: 'discarded', decisionSource: 'manual', decidedByUserId: req.user!.id })
    .where(eq(schema.importBatches.id, id)).returning();
  res.json(batchSummary(updated, req.user!.email));
});

export default router;
