// Bank balance ledger + computed cash position. Account CRUD is served by
// the generic /api/entities/BankAccount routes (server/routes/entities.ts) -
// this file is only for the append-only balance ledger and the derived
// available/restricted position, which need the "latest entry per account"
// read the generic layer can't express (see server/db/bankBalanceLedger.ts).
// No public sub-routes, so authMiddleware is applied router-wide, matching
// inventory.ts's/users.ts's convention.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { listEntries, recordEntry, computePosition, CashError } from '../db/bankBalanceLedger.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof CashError ? 400 : 500);

router.get('/accounts/:id/entries', requirePermission('BankAccount', 'read'), async (req: AuthedRequest, res) => {
  try {
    res.json(await listEntries(req.params.id));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/accounts/:id/entries', requirePermission('BankAccount', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { asOfDate, balance, note } = req.body ?? {};
    if (typeof asOfDate !== 'string') return res.status(400).json({ message: 'asOfDate must be a string (YYYY-MM-DD)' });
    if (typeof balance !== 'number') return res.status(400).json({ message: 'balance must be a number' });
    if (note !== undefined && typeof note !== 'string') return res.status(400).json({ message: 'note must be a string' });
    const row = await recordEntry(req.user!.id, req.params.id, { asOfDate, balance, note });
    res.status(201).json(row);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.get('/position', requirePermission('BankAccount', 'read'), async (_req: AuthedRequest, res) => {
  try {
    res.json(await computePosition());
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
