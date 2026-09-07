// Onboarding: converting a recruitment pipeline entry into a real employee.
// A dedicated route (not the generic /api/entities layer) because it needs
// both the employees insert and the recruitments update to commit
// atomically - see server/db/recruitmentHire.ts.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { hireApplicant, HireError } from '../db/recruitmentHire.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof HireError ? 400 : 500);

/** POST /api/recruitment/:id/hire - body is the new employee's fields, same
 *  snake_case shape as Employee.create(). Requires write on both
 *  Recruitment (advancing the pipeline) and Employee (creating the row). */
router.post(
  '/:id/hire',
  requirePermission('Recruitment', 'write'),
  requirePermission('Employee', 'write'),
  async (req: AuthedRequest, res) => {
    try {
      const scope = await getUserDivisionScope(req.user!.id);
      if (scope.length > 0 && !scope.includes(req.body?.division)) {
        return res.status(403).json({ message: `You can only hire into: ${scope.join(', ')}` });
      }
      const result = await hireApplicant(req.params.id, req.body ?? {});
      res.status(201).json(result);
    } catch (err) {
      res.status(status(err)).json({ message: message(err) });
    }
  },
);

export default router;
