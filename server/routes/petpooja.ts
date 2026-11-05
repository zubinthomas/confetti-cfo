// PetPooja source management: create/rotate the inbound webhook secret we
// mint for PetPooja to echo back, and store/rotate the outbound credential
// triplet (appKey/appSecret/accessToken) PetPooja issues us. Human/JWT-
// authenticated admin surface, same shape as routes/tally.ts. The webhooks
// themselves (Sales/Menu/Stock/Callback) land on their own routers in later
// steps, authenticated via middleware/petpoojaWebhookAuth.ts instead.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq } from 'drizzle-orm';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { db, ready, schema } from '../db/client.ts';
import { resyncPetpoojaMenu } from '../petpooja/fetchMenu.ts';
import { batchSummary } from './import.ts';

const router = Router();
router.use(authMiddleware);

const SECRET_MASK = '••••••••';

// Never return the webhook secret hash (not displayable, same as Tally's
// apiKeyHash) - and mask the outbound credential triplet, same convention as
// settings.ts's mask() for isSecret values. Unlike Tally's apiKeyHash, these
// three ARE retrievable in principle (we need them for outbound calls), but
// there's no UI need to ever re-display them after entry, so they're masked
// here just like a secret setting.
const sourceSummary = (s: typeof schema.petpoojaSources.$inferSelect) => {
  const { inboundWebhookSecretHash: _hash, appKey, appSecret, accessToken, ...rest } = s;
  return {
    ...rest,
    appKey: appKey ? SECRET_MASK : null,
    appSecret: appSecret ? SECRET_MASK : null,
    accessToken: accessToken ? SECRET_MASK : null,
  };
};

const ENVIRONMENTS = ['sandbox', 'production'] as const;
const SYNC_MODES = ['auto', 'manual', 'paused'] as const;

/** GET /api/petpooja/sources - newest first. */
router.get('/sources', requirePermission('PetPooja', 'read'), async (_req, res) => {
  await ready();
  const rows = await db.select().from(schema.petpoojaSources).orderBy(desc(schema.petpoojaSources.id));
  res.json(rows.map(sourceSummary));
});

/** POST /api/petpooja/sources { label, environment, restId, appKey, appSecret, accessToken }
 *  The returned webhookSecret is shown once; only its bcrypt hash is ever stored. */
router.post('/sources', requirePermission('PetPooja', 'write'), async (req, res) => {
  const { label, environment, restId, appKey, appSecret, accessToken } = req.body as {
    label?: string; environment?: string; restId?: string;
    appKey?: string; appSecret?: string; accessToken?: string;
  };
  if (!label?.trim()) return res.status(400).json({ message: 'label is required' });
  if (!ENVIRONMENTS.includes(environment as typeof ENVIRONMENTS[number])) {
    return res.status(400).json({ message: `environment must be one of: ${ENVIRONMENTS.join(', ')}` });
  }
  if (!restId?.trim() || !appKey?.trim() || !appSecret?.trim() || !accessToken?.trim()) {
    return res.status(400).json({ message: 'restId, appKey, appSecret and accessToken are all required' });
  }
  await ready();
  const webhookSecret = randomBytes(32).toString('hex');
  const inboundWebhookSecretHash = await bcrypt.hash(webhookSecret, 10);
  const [source] = await db.insert(schema.petpoojaSources).values({
    label: label.trim(),
    environment: environment as typeof ENVIRONMENTS[number],
    restId: restId.trim(),
    appKey: appKey.trim(),
    appSecret: appSecret.trim(),
    accessToken: accessToken.trim(),
    inboundWebhookSecretHash,
    syncMode: 'manual',
    createdAt: new Date().toISOString(),
  }).returning();
  res.status(201).json({ source: sourceSummary(source), webhookSecret });
});

/** PATCH /api/petpooja/sources/:id { label?, restId?, appKey?, appSecret?, accessToken?, syncMode? } */
router.patch('/sources/:id', requirePermission('PetPooja', 'write'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const { label, restId, appKey, appSecret, accessToken, syncMode } = req.body as {
    label?: string; restId?: string; appKey?: string; appSecret?: string;
    accessToken?: string; syncMode?: string;
  };
  const patch: Partial<typeof schema.petpoojaSources.$inferInsert> = {};
  if (typeof label === 'string' && label.trim()) patch.label = label.trim();
  if (typeof restId === 'string' && restId.trim()) patch.restId = restId.trim();
  if (typeof appKey === 'string' && appKey.trim()) patch.appKey = appKey.trim();
  if (typeof appSecret === 'string' && appSecret.trim()) patch.appSecret = appSecret.trim();
  if (typeof accessToken === 'string' && accessToken.trim()) patch.accessToken = accessToken.trim();
  if (syncMode !== undefined) {
    if (!SYNC_MODES.includes(syncMode as typeof SYNC_MODES[number])) {
      return res.status(400).json({ message: `syncMode must be one of: ${SYNC_MODES.join(', ')}` });
    }
    patch.syncMode = syncMode as typeof SYNC_MODES[number];
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: 'Nothing to update' });
  const [updated] = await db.update(schema.petpoojaSources).set(patch)
    .where(eq(schema.petpoojaSources.id, id)).returning();
  if (!updated) return res.status(404).json({ message: 'Not found' });
  res.json(sourceSummary(updated));
});

/** POST /api/petpooja/sources/:id/rotate-webhook-secret - the old secret
 *  stops working immediately; PetPooja must be given the new one out of band. */
router.post('/sources/:id/rotate-webhook-secret', requirePermission('PetPooja', 'write'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const webhookSecret = randomBytes(32).toString('hex');
  const inboundWebhookSecretHash = await bcrypt.hash(webhookSecret, 10);
  const [updated] = await db.update(schema.petpoojaSources).set({ inboundWebhookSecretHash })
    .where(eq(schema.petpoojaSources.id, id)).returning();
  if (!updated) return res.status(404).json({ message: 'Not found' });
  res.json({ source: sourceSummary(updated), webhookSecret });
});

/** DELETE /api/petpooja/sources/:id */
router.delete('/sources/:id', requirePermission('PetPooja', 'delete'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const [source] = await db.select().from(schema.petpoojaSources).where(eq(schema.petpoojaSources.id, id));
  if (!source) return res.status(404).json({ message: 'Not found' });
  await db.delete(schema.petpoojaSources).where(eq(schema.petpoojaSources.id, id));
  res.json({ ok: true });
});

const SALES_ORDERS_LIMIT = 500;
const OUTBOUND_ORDERS_LIMIT = 500;

/** GET /api/petpooja/sales-orders?petpoojaSourceId=&status= - newest first,
 *  no secrets on this table so nothing here needs masking. Gated by its own
 *  'PetpoojaSales' resource (read-only, separate from 'PetPooja'
 *  credential/config admin), same split as TallySource vs. OutstandingBills. */
router.get('/sales-orders', requirePermission('PetpoojaSales', 'read'), async (req, res) => {
  await ready();
  const { petpoojaSourceId, status } = req.query as { petpoojaSourceId?: string; status?: string };
  const conditions = [];
  if (petpoojaSourceId) conditions.push(eq(schema.petpoojaSalesOrders.petpoojaSourceId, Number(petpoojaSourceId)));
  if (status) conditions.push(eq(schema.petpoojaSalesOrders.status, status));
  const rows = await db.select().from(schema.petpoojaSalesOrders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.petpoojaSalesOrders.orderCreatedAt))
    .limit(SALES_ORDERS_LIMIT);
  res.json(rows);
});

/** GET /api/petpooja/menu?petpoojaSourceId= - the current catalog mirror
 *  for one source: all 5 entity tables + the config row. Gated by its own
 *  'PetpoojaMenu' resource (read-only, separate from 'PetPooja'), same split
 *  as PetpoojaSales vs. PetPooja. */
router.get('/menu', requirePermission('PetpoojaMenu', 'read'), async (req, res) => {
  await ready();
  const petpoojaSourceId = Number(req.query.petpoojaSourceId);
  if (!Number.isInteger(petpoojaSourceId)) {
    return res.status(400).json({ message: 'petpoojaSourceId is required' });
  }
  const [categories, items, addonGroups, addonItems, taxes, configRows] = await Promise.all([
    db.select().from(schema.petpoojaMenuCategories).where(eq(schema.petpoojaMenuCategories.petpoojaSourceId, petpoojaSourceId)),
    db.select().from(schema.petpoojaMenuItems).where(eq(schema.petpoojaMenuItems.petpoojaSourceId, petpoojaSourceId)),
    db.select().from(schema.petpoojaMenuAddonGroups).where(eq(schema.petpoojaMenuAddonGroups.petpoojaSourceId, petpoojaSourceId)),
    db.select().from(schema.petpoojaMenuAddonItems).where(eq(schema.petpoojaMenuAddonItems.petpoojaSourceId, petpoojaSourceId)),
    db.select().from(schema.petpoojaMenuTaxes).where(eq(schema.petpoojaMenuTaxes.petpoojaSourceId, petpoojaSourceId)),
    db.select().from(schema.petpoojaMenuConfig).where(eq(schema.petpoojaMenuConfig.petpoojaSourceId, petpoojaSourceId)),
  ]);
  res.json({ categories, items, addonGroups, addonItems, taxes, config: configRows[0] ?? null });
});

/** GET /api/petpooja/orders?petpoojaSourceId= - orders *this app* has
 *  placed via Save Order (step 6, plumbing only - this list is empty until
 *  something calls placePetpoojaOrder). Gated by its own 'PetpoojaOrders'
 *  resource, same read-only split as PetpoojaSales/PetpoojaMenu. */
router.get('/orders', requirePermission('PetpoojaOrders', 'read'), async (req, res) => {
  await ready();
  const { petpoojaSourceId } = req.query as { petpoojaSourceId?: string };
  const conditions = [];
  if (petpoojaSourceId) conditions.push(eq(schema.petpoojaOutboundOrders.petpoojaSourceId, Number(petpoojaSourceId)));
  const rows = await db.select().from(schema.petpoojaOutboundOrders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.petpoojaOutboundOrders.createdAt))
    .limit(OUTBOUND_ORDERS_LIMIT);
  res.json(rows);
});

/** POST /api/petpooja/sources/:id/resync-menu - an on-demand Fetch Menu
 *  call, same trust level as source CRUD (triggering an outbound call using
 *  this source's stored credentials), not the read-only catalog resource. */
router.post('/sources/:id/resync-menu', requirePermission('PetPooja', 'write'), async (req, res) => {
  await ready();
  const id = Number(req.params.id);
  const [source] = await db.select().from(schema.petpoojaSources).where(eq(schema.petpoojaSources.id, id));
  if (!source) return res.status(404).json({ message: 'Not found' });
  const result = await resyncPetpoojaMenu(source);
  res.json({
    status: result.status,
    error: result.error,
    batch: result.batch ? batchSummary(result.batch) : null,
  });
});

export default router;
