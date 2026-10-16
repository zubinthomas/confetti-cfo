// Owner/deadline/note assignment for a named recurring exception (today just
// the three Leadership Command Centre "Where to Intervene" items - see
// src/components/dashboard/ExceptionAssignmentPanel.tsx). Mirrors
// routes/periods.ts's shape: one small mutation route, gated separately from
// whatever page renders the exception itself.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { listAssignments, setAssignment, ExceptionAssignmentError } from '../db/exceptionAssignments.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof ExceptionAssignmentError ? 400 : 500);

/** GET /api/exceptions - all current assignments. */
router.get('/', requirePermission('ExceptionAssignment', 'read'), async (_req, res) => {
  try {
    res.json(await listAssignments());
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

/** PATCH /api/exceptions/:key/assign - body { ownerUserId?, deadline?, note? },
 *  all nullable (null/omitted clears that field). Upserts the row for :key. */
router.patch('/:key/assign', requirePermission('ExceptionAssignment', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { ownerUserId, deadline, note } = req.body ?? {};
    if (ownerUserId != null && typeof ownerUserId !== 'number') {
      return res.status(400).json({ message: 'ownerUserId must be a number or null' });
    }
    const assignment = await setAssignment(req.user!.id, req.params.key, { ownerUserId, deadline, note });
    res.json(assignment);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
