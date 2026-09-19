// Offboarding: submit -> approve/reject -> finalize, each a multi-table
// atomic step - see server/db/employeeOffboard.ts. Mounted at
// /api/employees, sibling to the generic /api/entities/Employee routes.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { getEntityRow } from '../db.ts';
import { submitOffboarding, decideOffboarding, finalizeOffboarding, OffboardError } from '../db/employeeOffboard.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof OffboardError ? 400 : 500);

/** POST /api/employees/:id/offboard - requires write on both Employee
 *  (status flip to Notice Period) and EmployeeExit (the new record). */
router.post(
  '/:id/offboard',
  requirePermission('Employee', 'write'),
  requirePermission('EmployeeExit', 'write'),
  async (req: AuthedRequest, res) => {
    try {
      const scope = await getUserDivisionScope(req.user!.id);
      if (scope.length > 0) {
        const current = await getEntityRow('Employee', req.params.id);
        if (!current || !scope.includes(current.division as string)) {
          return res.status(403).json({ message: 'That employee is outside your assigned division.' });
        }
      }
      const result = await submitOffboarding(req.params.id, req.body ?? {});
      res.status(201).json(result);
    } catch (err) {
      res.status(status(err)).json({ message: message(err) });
    }
  },
);

/** POST /api/employees/exits/:exitId/approve|reject - gated by the
 *  employee's manager chain (see decideOffboarding), not division scope -
 *  a manager approving their own reports' exits doesn't need to also hold
 *  a division assignment. */
function decideRoute(decision: 'approved' | 'rejected') {
  return async (req: AuthedRequest, res: import('express').Response) => {
    try {
      const result = await decideOffboarding(req.params.exitId, req.user!.id, decision);
      res.json(result);
    } catch (err) {
      res.status(status(err)).json({ message: message(err) });
    }
  };
}

router.post('/exits/:exitId/approve', requirePermission('EmployeeExit', 'write'), decideRoute('approved'));
router.post('/exits/:exitId/reject', requirePermission('EmployeeExit', 'write'), decideRoute('rejected'));

/** POST /api/employees/exits/:exitId/finalize - same permissions as
 *  submitting, only takes effect once approved. */
router.post(
  '/exits/:exitId/finalize',
  requirePermission('Employee', 'write'),
  requirePermission('EmployeeExit', 'write'),
  async (req: AuthedRequest, res) => {
    try {
      const result = await finalizeOffboarding(req.params.exitId);
      res.json(result);
    } catch (err) {
      res.status(status(err)).json({ message: message(err) });
    }
  },
);

export default router;
