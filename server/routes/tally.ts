// Tally source management: create/rotate an agent's API key, tune its sync
// mode/cadence, and manage its ledger-mapping table. This is the human/JWT-
// authenticated admin surface - actually syncing happens on the agent's own
// endpoints (routes/tallyAgent.ts), authenticated with the API key this file
// issues.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { and, desc, eq, sql } from 'drizzle-orm';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { db, ready, schema } from '../db/client.ts';
import { loadWorkbook } from '../import/xlsx.ts';
import { parseLedgerList } from '../tally/parseLedgerList.ts';

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Never return the hash - it's a credential, not display data.
const sourceSummary = (s: typeof schema.tallySources.$inferSelect) => {
  const { apiKeyHash: _apiKeyHash, ...rest } = s;
  return rest;
};

/** GET /api/tally/sources - newest first. */
router.get('/sources', requirePermission('TallySource', 'read'), async (_req, res) => {
  await ready();
  const rows = await db.select().from(schema.tallySources).orderBy(desc(schema.tallySources.id));
  res.json(rows.map(sourceSummary));
});

/** POST /api/tally/sources { label } - the returned apiKey is shown once;
 *  only its bcrypt hash is ever stored. */
router.post('/sources', requirePermission('TallySource', 'write'), async (req, res) => {
  const { label, tallyGatewayUrl, tallyCompanyName } = req.body as {
    label?: string; tallyGatewayUrl?: string | null; tallyCompanyName?: string | null;
  };
  if (!label?.trim()) return res.status(400).json({ message: 'label is required' });
  await ready();
  const apiKey = randomBytes(32).toString('hex');
  const apiKeyHash = await bcrypt.hash(apiKey, 10);
  const [source] = await db.insert(schema.tallySources).values({
    label: label.trim(),
    apiKeyHash,
    syncMode: 'manual',
    syncIntervalMinutes: 15,
    tallyGatewayUrl: tallyGatewayUrl?.trim() || null,
    tallyCompanyName: tallyCompanyName?.trim() || null,
    createdAt: new Date().toISOString(),
  }).returning();
  res.status(201).json({ source: sourceSummary(source), apiKey });
});

const SYNC_MODES = ['auto', 'manual', 'paused'] as const;

/** PATCH /api/tally/sources/:id { label?, syncMode?, syncIntervalMinutes? } */
router.patch('/sources/:id', requirePermission('TallySource', 'write'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const { label, syncMode, syncIntervalMinutes, tallyGatewayUrl, tallyCompanyName } = req.body as {
    label?: string; syncMode?: string; syncIntervalMinutes?: number;
    tallyGatewayUrl?: string | null; tallyCompanyName?: string | null;
  };
  const patch: Partial<typeof schema.tallySources.$inferInsert> = {};
  if (typeof label === 'string' && label.trim()) patch.label = label.trim();
  if (syncMode !== undefined) {
    if (!SYNC_MODES.includes(syncMode as typeof SYNC_MODES[number])) {
      return res.status(400).json({ message: `syncMode must be one of: ${SYNC_MODES.join(', ')}` });
    }
    patch.syncMode = syncMode as typeof SYNC_MODES[number];
  }
  if (syncIntervalMinutes !== undefined) {
    if (!Number.isInteger(syncIntervalMinutes) || syncIntervalMinutes < 1) {
      return res.status(400).json({ message: 'syncIntervalMinutes must be a positive integer' });
    }
    patch.syncIntervalMinutes = syncIntervalMinutes;
  }
  // Explicit null clears the field (falls back to the agent's local config.toml) -
  // same "!== undefined" pattern as the mapping PATCH below, unlike label's
  // non-empty-string requirement.
  if (tallyGatewayUrl !== undefined) patch.tallyGatewayUrl = tallyGatewayUrl?.trim() || null;
  if (tallyCompanyName !== undefined) patch.tallyCompanyName = tallyCompanyName?.trim() || null;
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: 'Nothing to update' });
  const [updated] = await db.update(schema.tallySources).set(patch)
    .where(eq(schema.tallySources.id, id)).returning();
  if (!updated) return res.status(404).json({ message: 'Not found' });
  res.json(sourceSummary(updated));
});

/** POST /api/tally/sources/:id/rotate-key - the old key stops working immediately. */
router.post('/sources/:id/rotate-key', requirePermission('TallySource', 'write'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const apiKey = randomBytes(32).toString('hex');
  const apiKeyHash = await bcrypt.hash(apiKey, 10);
  const [updated] = await db.update(schema.tallySources).set({ apiKeyHash })
    .where(eq(schema.tallySources.id, id)).returning();
  if (!updated) return res.status(404).json({ message: 'Not found' });
  res.json({ source: sourceSummary(updated), apiKey });
});

/** DELETE /api/tally/sources/:id - pending previews are discarded; committed batches keep history. */
router.delete('/sources/:id', requirePermission('TallySource', 'delete'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const [source] = await db.select().from(schema.tallySources).where(eq(schema.tallySources.id, id));
  if (!source) return res.status(404).json({ message: 'Not found' });
  await db.update(schema.importBatches)
    .set({ status: 'discarded' })
    .where(and(
      eq(schema.importBatches.tallySourceId, id),
      eq(schema.importBatches.status, 'preview'),
    ));
  await db.delete(schema.tallySources).where(eq(schema.tallySources.id, id));
  res.json({ ok: true });
});

/** GET /api/tally/sources/:id/mappings */
router.get('/sources/:id/mappings', requirePermission('TallySource', 'read'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const rows = await db.select().from(schema.tallyLedgerMappings)
    .where(eq(schema.tallyLedgerMappings.tallySourceId, id));
  res.json(rows);
});

/** POST /api/tally/sources/:id/mappings/import - upload a Tally "List of
 *  Ledgers" export (.xlsx) to seed/refresh this source's mapping rows.
 *  Re-importing an updated export only refreshes groupName - any ledger
 *  already assigned a businessUnitId/lineItemId keeps that assignment,
 *  since a re-export happens for reasons unrelated to mapping work (new
 *  ledgers added in Tally, say) and shouldn't wipe it out. */
router.post('/sources/:id/mappings/import', requirePermission('TallySource', 'write'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    await ready();
    const tallySourceId = Number(req.params.id);
    const [source] = await db.select({ id: schema.tallySources.id }).from(schema.tallySources)
      .where(eq(schema.tallySources.id, tallySourceId));
    if (!source) return res.status(404).json({ message: 'Not found' });

    const wb = await loadWorkbook(req.file.buffer);
    const parsedRows = parseLedgerList(wb);
    if (parsedRows.length === 0) {
      return res.status(400).json({
        message: 'No "List of Ledgers" sheet found, or it had no ledger rows - expected a Tally chart-of-accounts export',
      });
    }

    const now = new Date().toISOString();
    let imported = 0;
    for (let i = 0; i < parsedRows.length; i += 1000) {
      const chunk = parsedRows.slice(i, i + 1000).map((r): typeof schema.tallyLedgerMappings.$inferInsert => ({
        tallySourceId, ledgerName: r.ledgerName, groupName: r.groupName,
        businessUnitId: null, lineItemId: null, createdAt: now,
      }));
      await db.insert(schema.tallyLedgerMappings).values(chunk).onConflictDoUpdate({
        target: [schema.tallyLedgerMappings.tallySourceId, schema.tallyLedgerMappings.ledgerName],
        set: { groupName: sql`excluded.group_name` }, // businessUnitId/lineItemId untouched on conflict
      });
      imported += chunk.length;
    }
    res.status(201).json({ imported });
  } catch (err) {
    console.error('tally mappings import error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Import failed' });
  }
});

/** POST /api/tally/sources/:id/mappings { ledgerName, groupName?, businessUnitId?, lineItemId? }
 *  Upserts by (source, ledgerName) - a single-row escape hatch alongside the
 *  bulk importer above, e.g. for adding one ledger the export missed. */
router.post('/sources/:id/mappings', requirePermission('TallySource', 'write'), async (req, res) => {
  await ready();
  const tallySourceId = Number(req.params.id);
  const { ledgerName, groupName, businessUnitId, lineItemId } = req.body as {
    ledgerName?: string; groupName?: string | null; businessUnitId?: number | null; lineItemId?: number | null;
  };
  if (!ledgerName?.trim()) return res.status(400).json({ message: 'ledgerName is required' });
  const [row] = await db.insert(schema.tallyLedgerMappings).values({
    tallySourceId,
    ledgerName: ledgerName.trim(),
    groupName: groupName ?? null,
    businessUnitId: businessUnitId ?? null,
    lineItemId: lineItemId ?? null,
    createdAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [schema.tallyLedgerMappings.tallySourceId, schema.tallyLedgerMappings.ledgerName],
    set: { groupName: groupName ?? null, businessUnitId: businessUnitId ?? null, lineItemId: lineItemId ?? null },
  }).returning();
  res.status(201).json(row);
});

const VALUE_MODES = ['balance', 'period'] as const;
const PERIOD_GRANULARITIES = ['month', 'week'] as const;

/** PATCH /api/tally/mappings/:id { businessUnitId?, lineItemId?, valueMode?,
 *  periodGranularity? } - assigns (or clears, with null) where a ledger's
 *  pushed values should land, and whether it pushes a point-in-time balance
 *  or a period-aggregated (P&L) figure. */
router.patch('/mappings/:id', requirePermission('TallySource', 'write'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const { businessUnitId, lineItemId, valueMode, periodGranularity } = req.body as {
    businessUnitId?: number | null; lineItemId?: number | null;
    valueMode?: string; periodGranularity?: string;
  };
  const patch: Partial<typeof schema.tallyLedgerMappings.$inferInsert> = {};
  if (businessUnitId !== undefined) patch.businessUnitId = businessUnitId;
  if (lineItemId !== undefined) patch.lineItemId = lineItemId;
  if (valueMode !== undefined) {
    if (!VALUE_MODES.includes(valueMode as typeof VALUE_MODES[number])) {
      return res.status(400).json({ message: `valueMode must be one of: ${VALUE_MODES.join(', ')}` });
    }
    patch.valueMode = valueMode as typeof VALUE_MODES[number];
  }
  if (periodGranularity !== undefined) {
    if (!PERIOD_GRANULARITIES.includes(periodGranularity as typeof PERIOD_GRANULARITIES[number])) {
      return res.status(400).json({ message: `periodGranularity must be one of: ${PERIOD_GRANULARITIES.join(', ')}` });
    }
    patch.periodGranularity = periodGranularity as typeof PERIOD_GRANULARITIES[number];
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: 'Nothing to update' });
  const [updated] = await db.update(schema.tallyLedgerMappings).set(patch)
    .where(eq(schema.tallyLedgerMappings.id, id)).returning();
  if (!updated) return res.status(404).json({ message: 'Not found' });
  res.json(updated);
});

export default router;
