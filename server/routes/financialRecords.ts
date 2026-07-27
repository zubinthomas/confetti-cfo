import { Router } from 'express';
import { listFinancialRecords } from '../db/financialRecords.ts';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { csvInts, csvStrs } from './queryFilters.ts';

const router = Router();

router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/financial-records?businessUnitId=1,2&fiscalYear=2025-2026&periodType=month */
router.get('/', requirePermission('FinancialRecord', 'read'), async (req, res) => {
  try {
    const records = await listFinancialRecords({
      businessUnitId: csvInts(req.query.businessUnitId),
      periodId: csvInts(req.query.periodId),
      lineItemId: csvInts(req.query.lineItemId),
      fiscalYear: csvStrs(req.query.fiscalYear),
      periodType: csvStrs(req.query.periodType) as ('month' | 'week' | 'custom')[] | undefined,
    });
    res.json(records);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

export default router;
