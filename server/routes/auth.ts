import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { asc, eq, and, isNull, gt } from 'drizzle-orm';
import { Router } from 'express';
import { db, ready, schema } from '../db/client.ts';
import { authMiddleware, signToken, type AuthedRequest } from '../middleware/auth.ts';
import { getEffectivePermissions } from '../db/permissions.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { getSelfEmployeeView, getDepartmentRoster } from '../db/employeeSelf.ts';
import { sendMail, MailNotConfiguredError } from '../email/sendMail.ts';

const router = Router();
const RESET_TOKEN_EXPIRY_MINUTES = 30;

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

// A separate, lazily-fetched endpoint rather than folded into /auth/me -
// unlike the rest of that response, a department's headcount isn't small
// and bounded, so there's no reason to carry it on every single page load
// when only MyProfile.tsx ever needs it.
router.get('/roster', authMiddleware, async (req: AuthedRequest, res) => {
  res.json(await getDepartmentRoster(req.user!.id));
});

router.post('/logout', (_req, res) => res.json({ message: 'ok' }));

/** POST /auth/reset-password-request { email } - always responds { message: 'ok' }
 *  regardless of whether the email matches an account, so this never leaks
 *  account existence (same convention as /login's post-password active check). */
router.post('/reset-password-request', async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email === 'string' && email) {
    try {
      await ready();
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
      if (user) {
        const now = new Date();
        const token = randomBytes(32).toString('hex');
        await db.insert(schema.passwordResetTokens).values({
          userId: user.id,
          token,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + RESET_TOKEN_EXPIRY_MINUTES * 60_000).toISOString(),
        });
        const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
        await sendMail({
          to: user.email,
          subject: 'Reset your password',
          text: `Reset your password: ${link}\n\nThis link expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes. If you didn't request this, ignore this email.`,
          html: `<p>Reset your password: <a href="${link}">${link}</a></p><p>This link expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes. If you didn't request this, ignore this email.</p>`,
        });
      }
    } catch (err) {
      if (err instanceof MailNotConfiguredError) {
        console.warn('reset-password-request: SMTP not configured, no email sent:', err.message);
      } else {
        console.error('reset-password-request error:', err);
      }
    }
  }
  res.json({ message: 'ok' });
});

/** POST /auth/reset-password { resetToken, newPassword } */
router.post('/reset-password', async (req, res) => {
  const { resetToken, newPassword } = req.body ?? {};
  if (typeof resetToken !== 'string' || typeof newPassword !== 'string' || !resetToken || !newPassword) {
    return res.status(400).json({ message: 'resetToken and newPassword are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }
  await ready();
  const [row] = await db.select().from(schema.passwordResetTokens)
    .where(and(
      eq(schema.passwordResetTokens.token, resetToken),
      isNull(schema.passwordResetTokens.usedAt),
      gt(schema.passwordResetTokens.expiresAt, new Date().toISOString()),
    ));
  if (!row) return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, row.userId));
  await db.update(schema.passwordResetTokens).set({ usedAt: new Date().toISOString() }).where(eq(schema.passwordResetTokens.id, row.id));
  res.json({ message: 'ok' });
});

export default router;
