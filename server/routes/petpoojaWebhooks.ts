// PetPooja's inbound webhooks - machine-authenticated (petpoojaWebhookAuth,
// NOT the human JWT auth every other route uses), same split as
// routes/tally.ts (human admin) vs. routes/tallyAgent.ts (machine). Sales
// API, Menu Push, Item Stock On/Off, Order Callback, and the Store Status
// pair all live here.
import { Router } from 'express';
import { petpoojaWebhookAuth, type PetpoojaWebhookRequest } from '../middleware/petpoojaWebhookAuth.ts';
import { parseSalesPayload } from '../petpooja/parseSalesPayload.ts';
import { syncPetpoojaSales } from '../petpooja/syncSales.ts';
import { parseMenuPayload } from '../petpooja/parseMenuPayload.ts';
import { syncPetpoojaMenu } from '../petpooja/syncMenu.ts';
import { parseStockPayload } from '../petpooja/parseStockPayload.ts';
import { syncPetpoojaStock } from '../petpooja/syncStock.ts';
import { parseOrderCallbackPayload } from '../petpooja/parseOrderCallbackPayload.ts';
import { syncPetpoojaOrderCallback } from '../petpooja/syncOrderCallback.ts';
import { validateStoreStatusRestId, buildGetStoreStatusResponse, applyUpdateStoreStatus } from '../petpooja/storeStatus.ts';
import { batchSummary } from './import.ts';

const router = Router();
router.use(petpoojaWebhookAuth);

/** POST /api/petpooja/webhooks/sales - one PetPooja order per call, pushed
 *  in real time on "SAVE AND PRINT" at the POS. Never 500s for a data-side
 *  problem (a malformed payload comes back as 400, not a crash); a
 *  cancelled order is a normal call for the same orderID with status
 *  flipped, not a separate endpoint. */
router.post('/sales', async (req: PetpoojaWebhookRequest, res) => {
  const source = req.petpoojaSource!;
  const parsed = parseSalesPayload(req.body, source);
  if (parsed.ok === false) {
    return res.status(400).json({ message: parsed.error });
  }
  const result = await syncPetpoojaSales(source, parsed.record, parsed.issues);
  res.json({
    status: result.status,
    error: result.error,
    batch: result.batch ? batchSummary(result.batch) : null,
  });
});

/** POST /api/petpooja/webhooks/menu - PetPooja's entire current catalog,
 *  pushed every time the merchant edits their menu. Never 500s for a
 *  data-side problem; an empty items/categories array is rejected as 400
 *  (parseMenuPayload treats it as a vendor-side error, not a catalog wipe -
 *  see that file's header comment). */
router.post('/menu', async (req: PetpoojaWebhookRequest, res) => {
  const source = req.petpoojaSource!;
  const parsed = parseMenuPayload(req.body, source, 'push');
  if (parsed.ok === false) {
    return res.status(400).json({ message: parsed.error });
  }
  const result = await syncPetpoojaMenu(source, parsed.payload, parsed.issues);
  res.json({
    status: result.status,
    error: result.error,
    batch: result.batch ? batchSummary(result.batch) : null,
  });
});

/** POST /api/petpooja/webhooks/stock - one endpoint for both directions
 *  (PetPooja's own docs: "For Update Item Stock off API, we suggest you to
 *  keep the same endpoint as item stock on"); `inStock` in the body picks
 *  the direction. Never 500s for a data-side problem; an itemID with no
 *  matching catalog row is a non-blocking warning, not a 400 - see
 *  mergeStock.ts's header comment. */
router.post('/stock', async (req: PetpoojaWebhookRequest, res) => {
  const source = req.petpoojaSource!;
  const parsed = parseStockPayload(req.body, source);
  if (parsed.ok === false) {
    return res.status(400).json({ message: parsed.error });
  }
  const result = await syncPetpoojaStock(source, parsed.payload, parsed.issues);
  res.json({
    status: result.status,
    error: result.error,
    batch: result.batch ? batchSummary(result.batch) : null,
  });
});

/** POST /api/petpooja/webhooks/order-callback - status updates for orders
 *  *we* placed via Save Order (step 6 is plumbing only, so nothing in this
 *  app calls Save Order yet - this route is still live and ready for
 *  whenever that changes). orderID in the body is PetPooja's own name for
 *  *our* clientOrderId (see parseOrderCallbackPayload.ts's header
 *  comment). An orderID with no matching petpoojaOutboundOrders row is a
 *  non-blocking warning, not a 400 - see mergeOrderCallback.ts. */
router.post('/order-callback', async (req: PetpoojaWebhookRequest, res) => {
  const source = req.petpoojaSource!;
  const parsed = parseOrderCallbackPayload(req.body, source);
  if (parsed.ok === false) {
    return res.status(400).json({ message: parsed.error });
  }
  const result = await syncPetpoojaOrderCallback(source, parsed.payload, parsed.issues);
  res.json({
    status: result.status,
    error: result.error,
    batch: result.batch ? batchSummary(result.batch) : null,
  });
});

/** POST /api/petpooja/webhooks/store-status - a pure read (Get Store
 *  Status): PetPooja/the merchant asks us whether this outlet is open for
 *  online orders. Doesn't touch import_batches - nothing is created or
 *  changed, see storeStatus.ts's header comment for why this and the
 *  route below skip the usual ParsedWorkbook pipeline. */
router.post('/store-status', async (req: PetpoojaWebhookRequest, res) => {
  const source = req.petpoojaSource!;
  const validation = validateStoreStatusRestId(req.body, source);
  if (validation.ok === false) {
    return res.status(400).json({ message: validation.error });
  }
  res.json(buildGetStoreStatusResponse(source));
});

/** POST /api/petpooja/webhooks/update-store-status - the merchant turning
 *  online ordering on/off for this outlet (Update Store Status). A real
 *  but small state change - directly updates petpoojaSources' own
 *  storeOpen/storeClosedReason/storeReopenAt columns, same relationship
 *  PATCH /api/petpooja/sources/:id already has to this table. */
router.post('/update-store-status', async (req: PetpoojaWebhookRequest, res) => {
  const source = req.petpoojaSource!;
  const validation = validateStoreStatusRestId(req.body, source);
  if (validation.ok === false) {
    return res.status(400).json({ message: validation.error });
  }
  const result = await applyUpdateStoreStatus(source, req.body);
  if (result.ok === false) {
    return res.status(400).json({ message: result.error });
  }
  res.json({ status: 'success', message: 'Store status updated' });
});

export default router;
