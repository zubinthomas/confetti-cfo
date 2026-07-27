// Read-only role listing. Two consumers, either permission is enough: the
// invite-creation form's "start from a role" preset picker (Invite:write),
// and the user-management edit modal's role checkboxes (User:write). Full
// role management (create/rank/grant/deny/assign) stays CLI-only
// (server/db/roles.ts).
import { Router } from 'express';
import { authMiddleware, type AuthedRequest } from '../middleware/auth.ts';
import { hasPermission, listRolesWithPermissions } from '../db/permissions.ts';

const router = Router();

router.get('/', authMiddleware, async (req: AuthedRequest, res) => {
  const [canInvite, canManageUsers] = await Promise.all([
    hasPermission(req.user!.id, 'Invite', 'write'),
    hasPermission(req.user!.id, 'User', 'write'),
  ]);
  if (!canInvite && !canManageUsers) {
    return res.status(403).json({ message: 'Forbidden: requires Invite:write or User:write' });
  }
  res.json(await listRolesWithPermissions());
});

export default router;
