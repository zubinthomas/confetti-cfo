// Role management. GET / is a shared read used by three consumers - the
// Roles page itself (Role:read), the invite-creation form's "start from a
// role" preset picker (Invite:write), and the user-management edit modal's
// role checkboxes (User:write); any one of the three is enough. Full
// create/rank/permission/delete management is Role:write/Role:delete only.
// No public sub-routes here, so authMiddleware is applied router-wide,
// matching settings.ts's/users.ts's convention.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { hasPermission, PermissionGrantError, type Perm } from '../db/permissions.ts';
import {
  listRoles, createRole, setRoleRank, replaceRolePermissions, deleteRole,
  RoleAdminError,
} from '../db/roleAdmin.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof RoleAdminError || err instanceof PermissionGrantError ? 400 : 500);

function parsePermissions(body: unknown): Perm[] {
  const perms = (body as { permissions?: unknown })?.permissions;
  if (!Array.isArray(perms)) throw new RoleAdminError('permissions must be an array');
  return perms.map((p) => {
    if (!p || typeof p.resource !== 'string' || typeof p.action !== 'string') {
      throw new RoleAdminError('each permission needs a resource and an action');
    }
    return { resource: p.resource, action: p.action } as Perm;
  });
}

router.get('/', async (req: AuthedRequest, res) => {
  const [canRole, canInvite, canManageUsers] = await Promise.all([
    hasPermission(req.user!.id, 'Role', 'read'),
    hasPermission(req.user!.id, 'Invite', 'write'),
    hasPermission(req.user!.id, 'User', 'write'),
  ]);
  if (!canRole && !canInvite && !canManageUsers) {
    return res.status(403).json({ message: 'Forbidden: requires Role:read, Invite:write or User:write' });
  }
  res.json(await listRoles());
});

router.post('/', requirePermission('Role', 'write'), async (req, res) => {
  try {
    const { name, rank } = req.body ?? {};
    if (typeof name !== 'string' || typeof rank !== 'number') {
      return res.status(400).json({ message: 'name (string) and rank (number) are required' });
    }
    res.json(await createRole(name, rank));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/rank', requirePermission('Role', 'write'), async (req, res) => {
  try {
    const { rank } = req.body ?? {};
    if (typeof rank !== 'number') return res.status(400).json({ message: 'rank must be a number' });
    res.json(await setRoleRank(Number(req.params.id), rank));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/permissions', requirePermission('Role', 'write'), async (req: AuthedRequest, res) => {
  try {
    const roles = await replaceRolePermissions(req.user!.id, Number(req.params.id), parsePermissions(req.body));
    res.json(roles);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/:id', requirePermission('Role', 'delete'), async (req, res) => {
  try {
    await deleteRole(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
