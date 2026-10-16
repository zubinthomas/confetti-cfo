import { Router } from 'express';
import { listRevenueTargets, listRevisions, reviseTarget, RevenueTargetError } from '../db/revenueTargets.ts';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { csvInts, csvStrs } from './queryFilters.ts';

const router = Router();

router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof RevenueTargetError ? 400 : 500);

const isValidCategory = (c: unknown): c is 'store' | 'fnb' => c === 'store' || c === 'fnb';

/** GET /api/revenue-targets?category=store,fnb&fiscalYear=2026-2027
 *  Read-only - gated by FinancialRecord:read (not a dedicated resource) since
 *  targets are a read-only adjunct to financial reporting and everyone who
 *  can already see /store or /fnb already holds this permission. Writes only
 *  ever happen via the Import permission, same as every other fact table -
 *  except the one manual revision path below. */
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

/** GET /api/revenue-targets/:periodId/:category/revisions - version history
 *  for one target, newest first. Gated by RevenueTarget:read, which every
 *  role that can see current targets already holds (seeded automatically). */
router.get('/:periodId/:category/revisions', requirePermission('RevenueTarget', 'read'), async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);
    if (!isValidCategory(req.params.category)) return res.status(400).json({ message: 'category must be store or fnb' });
    const revisions = await listRevisions(periodId, req.params.category);
    res.json(revisions);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

/** POST /api/revenue-targets/:periodId/:category/revise - body
 *  { targetAmount, note? }. The one deliberate exception to this file's own
 *  "writes only via Import" rule above - gated by RevenueTarget:write, not
 *  FinancialRecord:write (which doesn't exist as a grantable permission,
 *  since every other FinancialRecord write must stay import-gated). */
router.post('/:periodId/:category/revise', requirePermission('RevenueTarget', 'write'), async (req: AuthedRequest, res) => {
  try {
    const periodId = Number(req.params.periodId);
    if (!isValidCategory(req.params.category)) return res.status(400).json({ message: 'category must be store or fnb' });
    const { targetAmount, note } = req.body ?? {};
    const revision = await reviseTarget(req.user!.id, periodId, req.params.category, { targetAmount, note });
    res.json(revision);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
