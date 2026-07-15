// Workbook import: upload → validation preview → commit / discard.
// The parsed workbook is stored on the batch row, so commit replays it against
// the CURRENT database state (a fresh merge plan) inside one transaction.
import { Router } from 'express';
import multer from 'multer';
import { eq, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.ts';
import { db, ready, schema } from '../db/client.ts';
import { loadWorkbook } from '../import/xlsx.ts';
import { detectKind, PARSERS } from '../import/detect.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import type { Issue, ParsedWorkbook } from '../import/types.ts';

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');

// also used by routes/sheets.ts - keeps the heavy parsed payload out of responses
export const batchSummary = (b: typeof schema.importBatches.$inferSelect) => ({
  id: b.id, filename: b.filename, kind: b.kind, status: b.status,
  uploadedAt: b.uploadedAt, committedAt: b.committedAt,
  issues: b.issues, stats: b.stats,
  sourceType: b.sourceType, sheetSourceId: b.sheetSourceId,
});

/** POST /api/import/upload - parse + validate a workbook, store a preview batch. */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    await ready();
    const wb = await loadWorkbook(req.file.buffer);
    const kind = detectKind(wb);
    if (!kind) {
      return res.status(400).json({
        message: 'Unrecognised workbook - expected a CEPL P&L, Cafe Weekly P&L, or Sienna Store Sales file',
      });
    }
    const parsed = PARSERS[kind](wb);
    // preview merge plan against the current database (not committed)
    const plan = await buildMergePlan(parsed);
    const [batch] = await db.insert(schema.importBatches).values({
      filename: req.file.originalname,
      kind,
      status: 'preview',
      uploadedAt: new Date().toISOString(),
      committedAt: null,
      issues: parsed.issues,
      stats: plan.stats,
      payload: parsed,
    }).returning();
    res.status(201).json(batchSummary(batch));
  } catch (err) {
    console.error('import upload error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Import failed' });
  }
});

/** GET /api/import/batches - newest first, without payloads. */
router.get('/batches', async (_req, res) => {
  await ready();
  const rows = await db.select().from(schema.importBatches).orderBy(desc(schema.importBatches.id));
  res.json(rows.map(batchSummary));
});

/** POST /api/import/:id/commit */
router.post('/:id/commit', async (req, res) => {
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
    }).where(eq(schema.importBatches.id, id)).returning();
    res.json(batchSummary(updated));
  } catch (err) {
    console.error('import commit error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Commit failed' });
  }
});

/** POST /api/import/:id/discard */
router.post('/:id/discard', async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const [batch] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, id));
  if (!batch) return res.status(404).json({ message: 'Not found' });
  if (batch.status !== 'preview') return res.status(409).json({ message: `Batch is already ${batch.status}` });
  const [updated] = await db.update(schema.importBatches)
    .set({ status: 'discarded' })
    .where(eq(schema.importBatches.id, id)).returning();
  res.json(batchSummary(updated));
});

export default router;
