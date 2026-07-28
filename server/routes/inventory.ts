// Inventory transaction ledger. Item catalog CRUD is served by the generic
// /api/entities/Inventory routes (server/routes/entities.ts) - this file is
// only for the append-only ledger, which needs the atomic balance-update
// side effect the generic layer can't express (see
// server/db/inventoryLedger.ts). No public sub-routes, so authMiddleware
// is applied router-wide, matching users.ts's/settings.ts's convention.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { listTransactions, recordTransaction, InventoryError } from '../db/inventoryLedger.ts';

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

router.post('/items/:id/transactions', requirePermission('Inventory', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { type, quantity, note } = req.body ?? {};
    if (type !== 'in' && type !== 'out') return res.status(400).json({ message: 'type must be "in" or "out"' });
    if (typeof quantity !== 'number') return res.status(400).json({ message: 'quantity must be a number' });
    if (note !== undefined && typeof note !== 'string') return res.status(400).json({ message: 'note must be a string' });
    const row = await recordTransaction(req.user!.id, req.params.id, { type, quantity, note });
    res.status(201).json(row);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
