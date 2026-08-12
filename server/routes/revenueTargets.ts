import { Router } from 'express';
import { listRevenueTargets } from '../db/revenueTargets.ts';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { csvInts, csvStrs } from './queryFilters.ts';

const router = Router();

router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/revenue-targets?category=store,fnb&fiscalYear=2026-2027
 *  Read-only - gated by FinancialRecord:read (not a dedicated resource) since
 *  targets are a read-only adjunct to financial reporting and everyone who
 *  can already see /store or /fnb already holds this permission. Writes only
 *  ever happen via the Import permission, same as every other fact table. */
router.get('/', requirePermission('FinancialRecord', 'read'), async (req, res) => {
  try {
    const records = await listRevenueTargets({
      periodId: csvInts(req.query.periodId),
      category: csvStrs(req.query.category) as ('store' | 'fnb')[] | undefined,
      fiscalYear: csvStrs(req.query.fiscalYear),
    });
    res.json(records);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

export default router;
