// Outstanding receivables/payables, synced from Tally's bill-wise reports
// (server/tally/sync.ts's syncTallyBillsPush). Read-only - no manual-entry
// UI is in scope, same convention as financialRecords.ts.
import { Router } from 'express';
import { listOutstandingBills } from '../db/bills.ts';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';

const router = Router();
router.use(authMiddleware);

/** GET /api/bills - every currently-outstanding bill, receivable and
 *  payable together; the frontend buckets by ageing (src/data/billAgeing.ts). */
router.get('/', requirePermission('OutstandingBills', 'read'), async (_req, res) => {
  res.json(await listOutstandingBills());
});

export default router;
