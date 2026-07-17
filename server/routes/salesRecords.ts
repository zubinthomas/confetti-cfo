import { Router } from 'express';
import { listSalesRecords } from '../db/salesRecords.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { csvInts, csvStrs } from './queryFilters.ts';

const router = Router();

router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/sales-records?fiscalYear=2025-2026&channelId=1&categoryId=2,3 */
router.get('/', async (req, res) => {
  try {
    const records = await listSalesRecords({
      businessUnitId: csvInts(req.query.businessUnitId),
      periodId: csvInts(req.query.periodId),
      channelId: csvInts(req.query.channelId),
      categoryId: csvInts(req.query.categoryId),
      fiscalYear: csvStrs(req.query.fiscalYear),
    });
    res.json(records);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

export default router;
