// Offboarding: recording an exit and terminating an employee atomically -
// see server/db/employeeOffboard.ts. Mounted at /api/employees, sibling to
// the generic /api/entities/Employee routes.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { getEntityRow } from '../db.ts';
import { offboardEmployee, OffboardError } from '../db/employeeOffboard.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof OffboardError ? 400 : 500);

/** POST /api/employees/:id/offboard - requires write on both Employee
 *  (status flip) and EmployeeExit (the new record). */
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
      const result = await offboardEmployee(req.params.id, req.body ?? {});
      res.status(201).json(result);
    } catch (err) {
      res.status(status(err)).json({ message: message(err) });
    }
  },
);

export default router;
