import { Router } from 'express';
import { listConsignmentRecords } from '../db/consignmentRecords.ts';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { csvInts, csvStrs } from './queryFilters.ts';

const router = Router();

router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/consignment-records?fiscalYear=2025-2026&vendorId=1,2 */
router.get('/', requirePermission('ConsignmentRecord', 'read'), async (req, res) => {
  try {
    const records = await listConsignmentRecords({
      periodId: csvInts(req.query.periodId),
      vendorId: csvInts(req.query.vendorId),
      fiscalYear: csvStrs(req.query.fiscalYear),
    });
    res.json(records);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

export default router;
