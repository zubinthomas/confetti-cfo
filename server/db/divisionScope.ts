// Row-level division scoping, orthogonal to the Employee/Licence/
// Recruitment/LeaveRequest resource permissions in permissions.ts - see
// the userDivisionScopes table comment in schema.ts. No rows for a user
// means unrestricted; this module is the only place that reads/writes that
// table, consumed by routes/entities.ts (enforcement), routes/auth.ts
// (/auth/me), and routes/users.ts (admin view/edit).
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class DivisionScopeError extends Error {}

/** Empty array = unrestricted (today's behavior for everyone who has never
 *  been scoped). Non-empty = restricted to exactly these divisions. */
export async function getUserDivisionScope(userId: number): Promise<string[]> {
  await ready();
  const rows = await db
    .select({ division: schema.userDivisionScopes.division })
    .from(schema.userDivisionScopes)
    .where(eq(schema.userDivisionScopes.userId, userId));
  return rows.map((r) => r.division);
}

/** Every scoped user's division list, keyed by userId - for the Users page
 *  list/detail views, avoiding one query per row. */
export async function getAllDivisionScopes(): Promise<Map<number, string[]>> {
  await ready();
  const rows = await db.select().from(schema.userDivisionScopes);
  const byUser = new Map<number, string[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r.division);
    byUser.set(r.userId, list);
  }
  return byUser;
}

/** Assigning a scope only ever narrows a user's access, never grants
 *  anything - unlike roles/permissions there's no escalation path, so
 *  (unlike replaceUserRoles/replaceUserPermissions) this needs no
 *  assertGrantable-style clamping. Self-edit is still blocked though:
 *  clearing your *own* scope rows would widen your own access back to
 *  unrestricted, which is a real self-escalation. */
export async function replaceUserDivisionScope(targetId: number, editorId: number, divisions: string[]) {
  await ready();
  if (targetId === editorId) throw new DivisionScopeError("You can't change your own division scope.");
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, targetId));
  if (!user) throw new DivisionScopeError(`No user with id ${targetId}`);

  const unique = [...new Set(divisions)];
  await db.transaction(async (tx) => {
    await tx.delete(schema.userDivisionScopes).where(eq(schema.userDivisionScopes.userId, targetId));
    for (const division of unique) {
      await tx.insert(schema.userDivisionScopes).values({ userId: targetId, division });
    }
  });
  return unique;
}
