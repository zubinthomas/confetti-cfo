// Read-only role listing, gated by Invite:write since its only consumer is
// the invite-creation form's "start from a role" preset picker. Full role
// management (create/rank/grant/deny/assign) stays CLI-only (server/db/roles.ts).
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { listRolesWithPermissions } from '../db/permissions.ts';

const router = Router();

router.get('/', authMiddleware, requirePermission('Invite', 'write'), async (_req, res) => {
  res.json(await listRolesWithPermissions());
});

export default router;
