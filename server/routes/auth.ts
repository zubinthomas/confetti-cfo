import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db, ready, schema } from '../db/client.ts';
import { authMiddleware, signToken, type AuthedRequest } from '../middleware/auth.ts';
import { getEffectivePermissions } from '../db/permissions.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { getSelfEmployeeView } from '../db/employeeSelf.ts';

const router = Router();

// There is no open registration - accounts are created via the CLI
// (server/db/users.ts) or by accepting an invite (server/routes/invites.ts).

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }
  await ready();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  // Checked after the password compare, not before, so a wrong-password
  // attempt against a deactivated account still gets the generic message
  // above - doesn't leak account status to someone without the password.
  if (!user.active) {
    return res.status(403).json({ message: 'This account has been deactivated.' });
  }
  const access_token = signToken({ id: user.id, email: user.email });
  res.json({ access_token });
});

router.get('/me', authMiddleware, async (req: AuthedRequest, res) => {
  await ready();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.id));
  if (!user) return res.status(401).json({ message: 'User no longer exists' });
  const roles = await db
    .select({ id: schema.roles.id, name: schema.roles.name, rank: schema.roles.rank })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .where(eq(schema.userRoles.userId, user.id))
    .orderBy(asc(schema.roles.rank));
  const effective = await getEffectivePermissions(user.id);
  const divisionScope = await getUserDivisionScope(user.id);
  const employee = await getSelfEmployeeView(user.id);
  res.json({
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    roles,
    permissions: effective.map((p) => `${p.resource}:${p.action}`),
    divisionScope,
    employee,
  });
});

router.post('/logout', (_req, res) => res.json({ message: 'ok' }));
router.post('/reset-password-request', (_req, res) => res.json({ message: 'ok' }));
router.post('/reset-password', (_req, res) => res.json({ message: 'ok' }));

export default router;
