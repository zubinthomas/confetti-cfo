// User-management: list accounts, edit an existing user's roles/direct
// permissions, activate/deactivate. Not server/db/users.ts - that's a CLI
// script with process.exit() side effects, unsafe to import from routes.
//
// Editing another user's roles/permissions is clamped exactly like invites
// (see assertGrantable in permissions.ts): the editor can only grant what
// they themselves currently hold. Permissions/roles the target already has
// that the editor doesn't hold are "locked" - preserved untouched rather
// than silently stripped by an under-privileged editor's save.
//
// Self-edit (targetId === editorId) is blocked outright for active status,
// roles and permissions - not just clamped - so an admin can't accidentally
// lock themselves out through this surface.
import { and, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import {
  assertGrantable, getEffectivePermissions, getUserDirectPermissions, listRolesWithPermissions,
  type Perm,
} from './permissions.ts';

export class UserAccountError extends Error {}

const key = (p: { resource: string; action: string }) => `${p.resource}:${p.action}`;

async function requireUserRow(id: number) {
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id));
  if (!u) throw new UserAccountError(`No user with id ${id}`);
  return u;
}

const USER_COLUMNS = {
  id: schema.users.id,
  email: schema.users.email,
  fullName: schema.users.fullName,
  active: schema.users.active,
  createdAt: schema.users.createdAt,
};

async function rolesFor(userId: number) {
  return db
    .select({ id: schema.roles.id, name: schema.roles.name, rank: schema.roles.rank })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .where(eq(schema.userRoles.userId, userId));
}

export async function listUsers() {
  await ready();
  const users = await db.select(USER_COLUMNS).from(schema.users).orderBy(schema.users.id);
  const roleRows = await db
    .select({
      userId: schema.userRoles.userId,
      id: schema.roles.id,
      name: schema.roles.name,
      rank: schema.roles.rank,
    })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId));

  return users.map((u) => ({
    ...u,
    roles: roleRows.filter((r) => r.userId === u.id).map(({ id, name, rank }) => ({ id, name, rank })),
  }));
}

export async function getUserDetail(id: number) {
  await ready();
  const [u] = await db.select(USER_COLUMNS).from(schema.users).where(eq(schema.users.id, id));
  if (!u) return null;
  const roles = await rolesFor(id);
  const directPermissions: Perm[] = (await getUserDirectPermissions(id))
    .filter((p) => p.effect === 'allow')
    .map(({ resource, action }) => ({ resource, action }));
  return { ...u, roles, directPermissions };
}

export async function setUserActive(targetId: number, editorId: number, active: boolean) {
  await ready();
  if (targetId === editorId) throw new UserAccountError("You can't change your own active status.");
  await requireUserRow(targetId);
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, targetId));
  return getUserDetail(targetId);
}

export async function replaceUserRoles(targetId: number, editorId: number, roleIds: number[]) {
  await ready();
  if (targetId === editorId) throw new UserAccountError("You can't change your own roles.");
  await requireUserRow(targetId);

  const allRoles = await listRolesWithPermissions();
  const byId = new Map(allRoles.map((r) => [r.id, r]));
  for (const id of roleIds) if (!byId.has(id)) throw new UserAccountError(`Unknown role id ${id}`);

  const editorHeld = new Set((await getEffectivePermissions(editorId)).map(key));
  const roleFullyHeld = (id: number) => byId.get(id)!.permissions.every((p) => editorHeld.has(key(p)));

  const currentIds = (await rolesFor(targetId)).map((r) => r.id);
  // Target already has this role, but the editor doesn't hold everything it
  // grants - preserved untouched, not offered as something to add either.
  const lockedIds = currentIds.filter((id) => !roleFullyHeld(id));
  const candidateIds = roleIds.filter((id) => !lockedIds.includes(id));

  const wantedPerms = candidateIds.flatMap((id) => byId.get(id)!.permissions);
  await assertGrantable(editorId, wantedPerms);

  const finalIds = [...new Set([...lockedIds, ...candidateIds])];

  await db.transaction(async (tx) => {
    await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, targetId));
    for (const roleId of finalIds) await tx.insert(schema.userRoles).values({ userId: targetId, roleId });
  });

  return getUserDetail(targetId);
}

export async function replaceUserPermissions(targetId: number, editorId: number, requested: Perm[]) {
  await ready();
  if (targetId === editorId) throw new UserAccountError("You can't change your own permissions.");
  await requireUserRow(targetId);

  const editorHeld = new Set((await getEffectivePermissions(editorId)).map(key));
  const currentAllow = (await getUserDirectPermissions(targetId)).filter((p) => p.effect === 'allow');
  const locked: Perm[] = currentAllow
    .filter((p) => !editorHeld.has(key(p)))
    .map(({ resource, action }) => ({ resource, action }));
  const lockedKeys = new Set(locked.map(key));

  const candidate = requested.filter((p) => !lockedKeys.has(key(p)));
  await assertGrantable(editorId, candidate);

  const finalPerms = [...locked, ...candidate];
  const finalKeys = new Set(finalPerms.map(key));
  const currentAllowKeys = new Set(currentAllow.map(key));
  const removeKeys = [...currentAllowKeys].filter((k) => !finalKeys.has(k));

  const catalog = await db.select().from(schema.permissions);
  const idByKey = new Map(catalog.map((r) => [key(r), r.id]));

  await db.transaction(async (tx) => {
    // Only ever touches effect='allow' rows - an explicit CLI-set deny for a
    // key outside this replacement's scope is never read or written here.
    for (const k of removeKeys) {
      const permissionId = idByKey.get(k);
      if (permissionId === undefined) continue;
      await tx.delete(schema.userPermissions).where(and(
        eq(schema.userPermissions.userId, targetId),
        eq(schema.userPermissions.permissionId, permissionId),
        eq(schema.userPermissions.effect, 'allow'),
      ));
    }
    for (const p of finalPerms) {
      const permissionId = idByKey.get(key(p));
      if (permissionId === undefined) throw new UserAccountError(`Unknown permission: ${key(p)}`);
      await tx.insert(schema.userPermissions).values({ userId: targetId, permissionId, effect: 'allow' })
        .onConflictDoUpdate({
          target: [schema.userPermissions.userId, schema.userPermissions.permissionId],
          set: { effect: 'allow' },
        });
    }
  });

  return getUserDetail(targetId);
}
