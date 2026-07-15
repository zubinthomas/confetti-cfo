// Saved Google Sheets sources: connect a sheet by URL, sync on demand
// (auto-sync lives in sheets/scheduler.ts). Syncing produces ordinary
// preview batches handled by the /api/import commit/discard flow.
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.ts';
import { db, ready, schema } from '../db/client.ts';
import {
  extractSpreadsheetId, resolveAccessMethod, serviceAccountEmail, SheetAccessError,
  listAccessibleSpreadsheets,
} from '../sheets/fetch.ts';
import { syncSource } from '../sheets/sync.ts';
import { batchSummary } from './import.ts';

const router = Router();
router.use(authMiddleware);

/** GET /api/sheets/config — lets the UI show the "share with…" hint. */
router.get('/config', (_req, res) => {
  res.json({ serviceAccountEmail: serviceAccountEmail() });
});

/** GET /api/sheets/available — spreadsheets the service account can see,
 *  flagged with whether they are already connected as a source. */
router.get('/available', async (_req, res) => {
  try {
    await ready();
    const [files, sources] = await Promise.all([
      listAccessibleSpreadsheets(),
      db.select({ spreadsheetId: schema.sheetSources.spreadsheetId }).from(schema.sheetSources),
    ]);
    const connected = new Set(sources.map((s) => s.spreadsheetId));
    res.json(files.map((f) => ({ ...f, connected: connected.has(f.id) })));
  } catch (err) {
    if (err instanceof SheetAccessError) {
      // no_service_account isn't a failure — the UI just hides the picker
      if (err.code === 'no_service_account') return res.json([]);
      return res.status(502).json({ message: err.message });
    }
    console.error('sheets available error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to list sheets' });
  }
});

/** GET /api/sheets/sources — newest first. */
router.get('/sources', async (_req, res) => {
  await ready();
  const rows = await db.select().from(schema.sheetSources).orderBy(desc(schema.sheetSources.id));
  res.json(rows);
});

/** POST /api/sheets/sources { url, label? } — validate access, save, sync now. */
router.post('/sources', async (req, res) => {
  try {
    const { url, label } = req.body as { url?: string; label?: string };
    if (!url) return res.status(400).json({ message: 'No sheet URL provided' });
    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      return res.status(400).json({ message: 'Could not find a spreadsheet ID in that URL' });
    }
    await ready();
    const [existing] = await db.select().from(schema.sheetSources)
      .where(eq(schema.sheetSources.spreadsheetId, spreadsheetId));
    if (existing) {
      return res.status(409).json({ message: `This sheet is already connected as "${existing.label}"` });
    }
    // validates we can actually read the sheet, and picks link vs service account
    const { method, buffer } = await resolveAccessMethod(spreadsheetId);
    const [source] = await db.insert(schema.sheetSources).values({
      label: label?.trim() || `Sheet ${spreadsheetId.slice(0, 8)}`,
      spreadsheetId,
      sheetUrl: url.trim(),
      accessMethod: method,
      syncMode: 'manual',
      createdAt: new Date().toISOString(),
    }).returning();
    const result = await syncSource(source, buffer);
    res.status(201).json({ source: result.source, batch: result.batch ? batchSummary(result.batch) : null });
  } catch (err) {
    if (err instanceof SheetAccessError) {
      return res.status(400).json({ message: err.message });
    }
    console.error('sheets add source error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to connect sheet' });
  }
});

const SYNC_MODES = ['auto', 'manual', 'paused'] as const;

/** PATCH /api/sheets/sources/:id { label?, syncMode? } */
router.patch('/sources/:id', async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const { label, syncMode } = req.body as { label?: string; syncMode?: string };
  const patch: Partial<typeof schema.sheetSources.$inferInsert> = {};
  if (typeof label === 'string' && label.trim()) patch.label = label.trim();
  if (syncMode !== undefined) {
    if (!SYNC_MODES.includes(syncMode as typeof SYNC_MODES[number])) {
      return res.status(400).json({ message: `syncMode must be one of: ${SYNC_MODES.join(', ')}` });
    }
    patch.syncMode = syncMode as typeof SYNC_MODES[number];
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: 'Nothing to update' });
  const [updated] = await db.update(schema.sheetSources).set(patch)
    .where(eq(schema.sheetSources.id, id)).returning();
  if (!updated) return res.status(404).json({ message: 'Not found' });
  res.json(updated);
});

/** DELETE /api/sheets/sources/:id — pending previews are discarded; committed batches keep history. */
router.delete('/sources/:id', async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const [source] = await db.select().from(schema.sheetSources).where(eq(schema.sheetSources.id, id));
  if (!source) return res.status(404).json({ message: 'Not found' });
  await db.update(schema.importBatches)
    .set({ status: 'discarded' })
    .where(and(
      eq(schema.importBatches.sheetSourceId, id),
      eq(schema.importBatches.status, 'preview'),
    ));
  await db.delete(schema.sheetSources).where(eq(schema.sheetSources.id, id));
  res.json({ ok: true });
});

/** POST /api/sheets/sources/:id/sync — sync errors land on the source row, not as HTTP errors. */
router.post('/sources/:id/sync', async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const [source] = await db.select().from(schema.sheetSources).where(eq(schema.sheetSources.id, id));
  if (!source) return res.status(404).json({ message: 'Not found' });
  const result = await syncSource(source);
  res.json({ source: result.source, batch: result.batch ? batchSummary(result.batch) : null });
});

export default router;
