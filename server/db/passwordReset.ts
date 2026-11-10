// Password reset token minting and lookup, shared by the self-service
// "forgot password" flow (server/routes/auth.ts, which emails the link)
// and the admin-generated reset link (server/db/userAccounts.ts, which
// returns the link directly instead of emailing it - see
// server/routes/users.ts).
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from './client.ts';

export const RESET_TOKEN_EXPIRY_MINUTES = 30;

export async function createPasswordResetToken(userId: number): Promise<{ token: string; link: string }> {
  const now = new Date();
  const token = randomBytes(32).toString('hex');
  await db.insert(schema.passwordResetTokens).values({
    userId,
    token,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_EXPIRY_MINUTES * 60_000).toISOString(),
  });
  const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  return { token, link };
}

/** Not used, not expired - the same validity check both GET and POST
 *  /auth/reset-password apply, kept in one place so they can't drift. */
export async function findValidResetToken(token: string) {
  const [row] = await db.select().from(schema.passwordResetTokens).where(and(
    eq(schema.passwordResetTokens.token, token),
    isNull(schema.passwordResetTokens.usedAt),
    gt(schema.passwordResetTokens.expiresAt, new Date().toISOString()),
  ));
  return row;
}
