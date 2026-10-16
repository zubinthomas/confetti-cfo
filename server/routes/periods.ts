// Marking a period reconciled (closed) or un-reconciled (reopened). Periods
// themselves (list, fields) ship through /api/reference, which is open to
// any authenticated user like every other taxonomy table - this route is
// only the one mutation, gated separately since not everyone who can see
// periods should be able to close them off.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { setPeriodReconciled, PeriodError } from '../db/periodsReconcile.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof PeriodError ? 400 : 500);

/** PATCH /api/periods/:id/reconcile - body { reconciled: boolean } */
router.patch('/:id/reconcile', requirePermission('Period', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { reconciled } = req.body ?? {};
    if (typeof reconciled !== 'boolean') return res.status(400).json({ message: 'reconciled must be a boolean' });
    const period = await setPeriodReconciled(req.user!.id, Number(req.params.id), reconciled);
    res.json(period);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
