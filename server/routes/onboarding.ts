// Onboarding stage tracking - see server/db/employeeOnboarding.ts. Mounted
// at /api/employees, sibling to offboarding.ts and the generic
// /api/entities/Employee routes. Gated by the existing Employee permission,
// not a new resource - onboarding is an Employee sub-feature the same way
// offboarding is.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { getEntityRow } from '../db.ts';
import { getOrCreateOnboarding, listOnboarding, setOnboardingStage, OnboardingError } from '../db/employeeOnboarding.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof OnboardingError ? 400 : 500);

async function assertScoped(userId: number, employeeId: string) {
  const scope = await getUserDivisionScope(userId);
  if (scope.length > 0) {
    const current = await getEntityRow('Employee', employeeId);
    if (!current || !scope.includes(current.division as string)) {
      throw new OnboardingError('That employee is outside your assigned division.');
    }
  }
}

router.get('/onboarding', requirePermission('Employee', 'read'), async (req: AuthedRequest, res) => {
  const scope = await getUserDivisionScope(req.user!.id);
  res.json(await listOnboarding(scope));
});

router.get('/:id/onboarding', requirePermission('Employee', 'read'), async (req: AuthedRequest, res) => {
  try {
    await assertScoped(req.user!.id, req.params.id);
    res.json(await getOrCreateOnboarding(req.params.id));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/onboarding', requirePermission('Employee', 'write'), async (req: AuthedRequest, res) => {
  try {
    await assertScoped(req.user!.id, req.params.id);
    const { field, completed } = req.body ?? {};
    if (typeof field !== 'string') return res.status(400).json({ message: 'field is required' });
    if (typeof completed !== 'boolean') return res.status(400).json({ message: 'completed must be a boolean' });
    res.json(await setOnboardingStage(req.params.id, field, completed));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
