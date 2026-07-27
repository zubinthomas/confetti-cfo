// User management: list accounts, edit roles/direct permissions, activate/
// deactivate. No public sub-routes (unlike invites), so authMiddleware is
// applied router-wide, matching settings.ts's convention.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { hasPermission, PermissionGrantError, type Perm } from '../db/permissions.ts';
import {
  listUsers, getUserDetail, setUserActive, replaceUserRoles, replaceUserPermissions,
  UserAccountError,
} from '../db/userAccounts.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof UserAccountError || err instanceof PermissionGrantError ? 400 : 500);

function parsePermissions(body: unknown): Perm[] {
  const perms = (body as { permissions?: unknown })?.permissions;
  if (!Array.isArray(perms)) throw new UserAccountError('permissions must be an array');
  return perms.map((p) => {
    if (!p || typeof p.resource !== 'string' || typeof p.action !== 'string') {
      throw new UserAccountError('each permission needs a resource and an action');
    }
    return { resource: p.resource, action: p.action } as Perm;
  });
}

router.get('/', requirePermission('User', 'read'), async (_req, res) => {
  res.json(await listUsers());
});

router.get('/:id', requirePermission('User', 'read'), async (req, res) => {
  const user = await getUserDetail(Number(req.params.id));
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json(user);
});

// Deactivating is gated by User:delete (the access-removing action, same
// split as Import/SheetSource's delete=discard/remove); reactivating and
// editing roles/permissions are User:write. The required permission depends
// on the request body, so this can't use the static requirePermission()
// factory - checked inline via hasPermission instead.
router.patch('/:id/active', async (req: AuthedRequest, res) => {
  try {
    const { active } = req.body ?? {};
    if (typeof active !== 'boolean') return res.status(400).json({ message: 'active must be a boolean' });
    const action = active ? 'write' : 'delete';
    if (!(await hasPermission(req.user!.id, 'User', action))) {
      return res.status(403).json({ message: `Forbidden: requires User:${action}` });
    }
    const user = await setUserActive(Number(req.params.id), req.user!.id, active);
    res.json(user);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/roles', requirePermission('User', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { roleIds } = req.body ?? {};
    if (!Array.isArray(roleIds) || !roleIds.every((id) => typeof id === 'number')) {
      return res.status(400).json({ message: 'roleIds must be an array of numbers' });
    }
    const user = await replaceUserRoles(Number(req.params.id), req.user!.id, roleIds);
    res.json(user);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/permissions', requirePermission('User', 'write'), async (req: AuthedRequest, res) => {
  try {
    const user = await replaceUserPermissions(Number(req.params.id), req.user!.id, parsePermissions(req.body));
    res.json(user);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
