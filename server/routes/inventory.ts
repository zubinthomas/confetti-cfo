// Inventory transaction ledger. Item catalog CRUD is served by the generic
// /api/entities/Inventory routes (server/routes/entities.ts) - this file is
// only for the append-only ledger, which needs the atomic balance-update
// side effect the generic layer can't express (see
// server/db/inventoryLedger.ts). No public sub-routes, so authMiddleware
// is applied router-wide, matching users.ts's/settings.ts's convention.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { listTransactions, recordTransaction, listBatches, listTransactionsForBusinessUnit, InventoryError } from '../db/inventoryLedger.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof InventoryError ? 400 : 500);

router.get('/items/:id/transactions', requirePermission('Inventory', 'read'), async (req: AuthedRequest, res) => {
  try {
    res.json(await listTransactions(req.user!.id, req.params.id));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.get('/items/:id/batches', requirePermission('Inventory', 'read'), async (req: AuthedRequest, res) => {
  try {
    res.json(await listBatches(req.user!.id, req.params.id));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// Across every item tagged with a given business unit, not one item - the
// input to the theoretical-COGS variance calculation (CraftDeptPage.tsx,
// SiennaTab.tsx), hence the query-string shape instead of an :id param.
router.get('/transactions', requirePermission('Inventory', 'read'), async (req: AuthedRequest, res) => {
  try {
    const { businessUnitKey, from, to } = req.query;
    if (typeof businessUnitKey !== 'string' || !businessUnitKey) return res.status(400).json({ message: 'businessUnitKey is required' });
    if (typeof from !== 'string' || typeof to !== 'string') return res.status(400).json({ message: 'from and to are required (YYYY-MM-DD)' });
    res.json(await listTransactionsForBusinessUnit(req.user!.id, businessUnitKey, from, to));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/items/:id/transactions', requirePermission('Inventory', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { type, quantity, note, expiryDate, batchId, unitCost } = req.body ?? {};
    if (type !== 'in' && type !== 'out') return res.status(400).json({ message: 'type must be "in" or "out"' });
    if (typeof quantity !== 'number') return res.status(400).json({ message: 'quantity must be a number' });
    if (note !== undefined && typeof note !== 'string') return res.status(400).json({ message: 'note must be a string' });
    const row = await recordTransaction(req.user!.id, req.params.id, { type, quantity, note, expiryDate, batchId, unitCost });
    res.status(201).json(row);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
