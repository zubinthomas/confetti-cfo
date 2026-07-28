// Invite-based account creation. GET/POST/PATCH/DELETE / are permission-
// gated (Invite:read/write/delete); the /public/* routes are deliberately
// NOT behind authMiddleware - the invitee has no account yet, the random
// token in the URL is what authorizes them.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { signToken } from '../middleware/auth.ts';
import {
  listInvites, createInvite, updateInvitePermissions, revokeInvite,
  getInviteByToken, acceptInvite, InviteError, type Perm,
} from '../db/invites.ts';
import { PermissionGrantError } from '../db/permissions.ts';

const router = Router();

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof InviteError || err instanceof PermissionGrantError ? 400 : 500);

function parsePermissions(body: unknown): Perm[] {
  const perms = (body as { permissions?: unknown })?.permissions;
  if (!Array.isArray(perms)) throw new InviteError('permissions must be an array');
  return perms.map((p) => {
    if (!p || typeof p.resource !== 'string' || typeof p.action !== 'string') {
      throw new InviteError('each permission needs a resource and an action');
    }
    return { resource: p.resource, action: p.action } as Perm;
  });
}

router.get('/', authMiddleware, requirePermission('Invite', 'read'), async (_req, res) => {
  res.json(await listInvites());
});

router.post('/', authMiddleware, requirePermission('Invite', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { email, employeeId } = req.body ?? {};
    if (typeof email !== 'string' || !email) return res.status(400).json({ message: 'email is required' });
    if (employeeId !== undefined && typeof employeeId !== 'string') {
      return res.status(400).json({ message: 'employeeId must be a string' });
    }
    const invite = await createInvite(req.user!.id, email, parsePermissions(req.body), employeeId);
    res.status(201).json(invite);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id', authMiddleware, requirePermission('Invite', 'write'), async (req: AuthedRequest, res) => {
  try {
    const invite = await updateInvitePermissions(Number(req.params.id), req.user!.id, parsePermissions(req.body));
    res.json(invite);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/:id', authMiddleware, requirePermission('Invite', 'delete'), async (req, res) => {
  try {
    const invite = await revokeInvite(Number(req.params.id));
    res.json(invite);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

/** GET /api/invites/public/:token - lets an unauthenticated invitee see who
 *  invited them and what they'll get, before deciding to accept. */
router.get('/public/:token', async (req, res) => {
  const invite = await getInviteByToken(req.params.token);
  if (!invite || invite.status !== 'pending' || invite.expired) {
    return res.status(404).json({ message: 'This invite is invalid, expired, or already used.' });
  }
  res.json({
    email: invite.email,
    invitedBy: invite.invitedBy ? { fullName: invite.invitedBy.fullName, email: invite.invitedBy.email } : null,
    permissions: invite.permissions,
    expiresAt: invite.expiresAt,
  });
});

router.post('/public/:token/accept', async (req, res) => {
  try {
    const { fullName, password } = req.body ?? {};
    if (typeof password !== 'string') return res.status(400).json({ message: 'password is required' });
    const user = await acceptInvite(req.params.token, { fullName: typeof fullName === 'string' ? fullName : '', password });
    const access_token = signToken({ id: user.id, email: user.email });
    res.status(201).json({ access_token });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
