// Nav/tab/widget layouts. Everyone edits their own (/me), no permission
// needed: it only changes how the app looks to them. Permission layouts need
// Layout:write. Role layouts need Layout:write AND Role:read (Role:read stays
// read-only: it never lets anyone change a layout on its own, but you can't
// edit a role's layout without being allowed to see roles). Resetting someone
// else's own layout needs User:write.
// The merge itself happens client-side (src/lib/layout/resolve.ts) from the
// layers GET /auth/me returns.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { hasPermission } from '../db/permissions.ts';
import {
  LayoutError, listLayouts, setUserLayout, clearUserLayout, setRoleLayout, clearRoleLayout,
  setPermissionLayout, clearPermissionLayout,
} from '../db/layouts.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof LayoutError ? 400 : 500);

router.put('/me', async (req: AuthedRequest, res) => {
  try {
    res.json({ config: await setUserLayout(req.user!.id, req.body?.config) });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/me', async (req: AuthedRequest, res) => {
  try {
    await clearUserLayout(req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.get('/', requirePermission('Layout', 'read'), async (req: AuthedRequest, res) => {
  try {
    const all = await listLayouts();
    // Role names and layouts are role data: only shown to people who can read roles.
    const canSeeRoles = await hasPermission(req.user!.id, 'Role', 'read');
    res.json({ ...all, roles: canSeeRoles ? all.roles : [] });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.put('/roles/:id', requirePermission('Layout', 'write'), requirePermission('Role', 'read'), async (req: AuthedRequest, res) => {
  try {
    res.json({ config: await setRoleLayout(req.user!.id, Number(req.params.id), req.body?.config) });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/roles/:id', requirePermission('Layout', 'write'), requirePermission('Role', 'read'), async (req, res) => {
  try {
    await clearRoleLayout(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.put('/permissions/:resource/:action', requirePermission('Layout', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { config, priority } = req.body ?? {};
    res.json({ config: await setPermissionLayout(req.user!.id, req.params.resource, req.params.action, priority, config) });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/permissions/:resource/:action', requirePermission('Layout', 'write'), async (req, res) => {
  try {
    await clearPermissionLayout(req.params.resource, req.params.action);
    res.json({ ok: true });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/users/:id', requirePermission('User', 'write'), async (req, res) => {
  try {
    await clearUserLayout(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
