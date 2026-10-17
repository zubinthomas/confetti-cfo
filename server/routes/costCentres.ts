// Cost-centre master review/assignment (section 3 of
// implementation-guidelines-gap-analysis.md) - see server/db/costCentres.ts.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { getOverview, assignMember, excludeMember, clearMember, CostCentreError } from '../db/costCentres.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof CostCentreError ? 400 : 500);

/** GET /api/cost-centres - centres with members, the excluded list, and everything still undecided. */
router.get('/', requirePermission('CostCentre', 'read'), async (_req, res) => {
  try {
    res.json(await getOverview());
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

/** PUT /api/cost-centres/members - body { kind, targetId, costCentreId } assigns (or moves) a target;
 *  { kind, targetId, exclusionReason } excludes it. Exactly one of the two. */
router.put('/members', requirePermission('CostCentre', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { kind, targetId, costCentreId, exclusionReason } = req.body ?? {};
    const hasCentre = costCentreId !== undefined && costCentreId !== null;
    const hasReason = exclusionReason !== undefined && exclusionReason !== null;
    if (hasCentre === hasReason) throw new CostCentreError('Send exactly one of costCentreId or exclusionReason');
    const row = hasCentre
      ? await assignMember(req.user!.id, { kind, targetId, costCentreId })
      : await excludeMember(req.user!.id, { kind, targetId, reason: exclusionReason });
    res.json(row);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

/** DELETE /api/cost-centres/members/:id - returns the target to "undecided". */
router.delete('/members/:id', requirePermission('CostCentre', 'write'), async (req, res) => {
  try {
    await clearMember(Number(req.params.id));
    res.json({ message: 'Cleared' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
