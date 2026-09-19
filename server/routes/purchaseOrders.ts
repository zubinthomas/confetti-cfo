// Purchase orders - an inventory sub-feature, so gated by the existing
// Inventory permission rather than a new resource (see server/db/
// purchaseOrders.ts). Bespoke rather than the generic entity CRUD (server/
// db.ts) since receiving a line item needs an atomic multi-table side
// effect the generic layer can't express.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  listPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  receivePurchaseOrderItem, PurchaseOrderError,
} from '../db/purchaseOrders.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof PurchaseOrderError ? 400 : 500);

router.get('/', requirePermission('Inventory', 'read'), async (req: AuthedRequest, res) => {
  res.json(await listPurchaseOrders(req.user!.id));
});

router.post('/', requirePermission('Inventory', 'write'), async (req: AuthedRequest, res) => {
  try {
    const order = await createPurchaseOrder(req.user!.id, req.body ?? {});
    res.status(201).json(order);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id', requirePermission('Inventory', 'write'), async (req: AuthedRequest, res) => {
  try {
    const order = await updatePurchaseOrder(req.user!.id, req.params.id, req.body ?? {});
    res.json(order);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/:id', requirePermission('Inventory', 'delete'), async (req: AuthedRequest, res) => {
  try {
    const ok = await deletePurchaseOrder(req.user!.id, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/:id/items/:itemId/receive', requirePermission('Inventory', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { quantity, expiryDate } = req.body ?? {};
    if (typeof quantity !== 'number') return res.status(400).json({ message: 'quantity must be a number' });
    const result = await receivePurchaseOrderItem(req.user!.id, req.params.id, req.params.itemId, { quantity, expiryDate });
    res.json(result);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
