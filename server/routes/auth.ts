import bcrypt from 'bcryptjs';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db, ready, schema } from '../db/client.ts';
import { authMiddleware, signToken, type AuthedRequest } from '../middleware/auth.ts';
import { getEffectivePermissions } from '../db/permissions.ts';

const router = Router();

// Registration is disabled - users are created via the CLI (server/db/users.ts)
router.post('/register', (_req, res) => res.status(404).json({ message: 'Not found' }));
router.post('/verify-otp', (_req, res) => res.status(404).json({ message: 'Not found' }));
router.post('/resend-otp', (_req, res) => res.status(404).json({ message: 'Not found' }));

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
    .orderBy(desc(schema.roles.rank));
  const effective = await getEffectivePermissions(user.id);
  res.json({
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    roles,
    permissions: effective.map((p) => `${p.resource}:${p.action}`),
  });
});

router.post('/logout', (_req, res) => res.json({ message: 'ok' }));
router.post('/reset-password-request', (_req, res) => res.json({ message: 'ok' }));
router.post('/reset-password', (_req, res) => res.json({ message: 'ok' }));

export default router;
