// Role management: list roles with their permissions and member counts,
// create/rank/delete a role, edit its permission grants. Not
// server/db/roles.ts - that's a CLI script with process.exit() side effects,
// unsafe to import from routes (same split as userAccounts.ts vs users.ts).
//
// Editing a role's permissions is clamped exactly like invites/users (see
// assertGrantable in permissions.ts): the editor can only grant what they
// themselves currently hold. Permissions the role already has that the
// editor doesn't hold are "locked" - preserved untouched rather than
// silently stripped by an under-privileged editor's save.
import { and, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import {
  assertGrantable, getEffectivePermissions, listRolesWithPermissions,
  type Perm,
} from './permissions.ts';

export class RoleAdminError extends Error {}

const SYSTEM_ROLES = new Set(['Admin', 'Viewer']);
const key = (p: { resource: string; action: string }) => `${p.resource}:${p.action}`;

async function requireRoleRow(id: number) {
  const [r] = await db.select().from(schema.roles).where(eq(schema.roles.id, id));
  if (!r) throw new RoleAdminError(`No role with id ${id}`);
  return r;
}

// Lower rank wins conflicts (0 = highest priority) - see hasPermission in
// permissions.ts - so 0 is the ceiling of authority and the floor of the
// valid range; negative ranks would have no meaning.
function requireValidRank(rank: number) {
  if (!Number.isInteger(rank)) throw new RoleAdminError('Rank must be an integer');
  if (rank < 0) throw new RoleAdminError('Rank must be 0 or greater - 0 is the highest priority');
}

export async function listRoles() {
  await ready();
  const [roles, memberRows] = await Promise.all([
    listRolesWithPermissions(),
    db.select({ roleId: schema.userRoles.roleId }).from(schema.userRoles),
  ]);
  const memberCounts = new Map<number, number>();
  for (const { roleId } of memberRows) memberCounts.set(roleId, (memberCounts.get(roleId) ?? 0) + 1);
  return roles.map((r) => ({ ...r, memberCount: memberCounts.get(r.id) ?? 0, system: SYSTEM_ROLES.has(r.name) }));
}

export async function createRole(name: string, rank: number) {
  await ready();
  const trimmed = name.trim();
  if (!trimmed) throw new RoleAdminError('Name is required');
  requireValidRank(rank);

  const [existingName] = await db.select().from(schema.roles).where(eq(schema.roles.name, trimmed));
  if (existingName) throw new RoleAdminError(`A role named "${trimmed}" already exists`);
  const [existingRank] = await db.select().from(schema.roles).where(eq(schema.roles.rank, rank));
  if (existingRank) throw new RoleAdminError(`Rank ${rank} is already used by role "${existingRank.name}" - ranks must be unique`);

  await db.insert(schema.roles).values({ name: trimmed, rank, createdAt: new Date().toISOString() });
  return listRoles();
}

export async function setRoleRank(roleId: number, rank: number) {
  await ready();
  requireValidRank(rank);
  const role = await requireRoleRow(roleId);
  const [existingRank] = await db.select().from(schema.roles).where(eq(schema.roles.rank, rank));
  if (existingRank && existingRank.id !== role.id) {
    throw new RoleAdminError(`Rank ${rank} is already used by role "${existingRank.name}" - ranks must be unique`);
  }
  await db.update(schema.roles).set({ rank }).where(eq(schema.roles.id, role.id));
  return listRoles();
}

export async function replaceRolePermissions(editorId: number, roleId: number, requested: Perm[]) {
  await ready();
  const role = await requireRoleRow(roleId);

  const editorHeld = new Set((await getEffectivePermissions(editorId)).map(key));
  const [current] = (await listRolesWithPermissions()).filter((r) => r.id === role.id);
  const currentAllow = current?.permissions ?? [];
  const locked: Perm[] = currentAllow.filter((p) => !editorHeld.has(key(p)));
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
      await tx.delete(schema.rolePermissions).where(and(
        eq(schema.rolePermissions.roleId, role.id),
        eq(schema.rolePermissions.permissionId, permissionId),
        eq(schema.rolePermissions.effect, 'allow'),
      ));
    }
    for (const p of finalPerms) {
      const permissionId = idByKey.get(key(p));
      if (permissionId === undefined) throw new RoleAdminError(`Unknown permission: ${key(p)}`);
      await tx.insert(schema.rolePermissions).values({ roleId: role.id, permissionId, effect: 'allow' })
        .onConflictDoUpdate({
          target: [schema.rolePermissions.roleId, schema.rolePermissions.permissionId],
          set: { effect: 'allow' },
        });
    }
  });

  return listRoles();
}

export async function deleteRole(roleId: number) {
  await ready();
  const role = await requireRoleRow(roleId);
  if (SYSTEM_ROLES.has(role.name)) {
    throw new RoleAdminError(`"${role.name}" is a built-in role and can't be deleted.`);
  }
  const members = await db.select().from(schema.userRoles).where(eq(schema.userRoles.roleId, role.id));
  if (members.length > 0) {
    throw new RoleAdminError(`"${role.name}" is still assigned to ${members.length} user${members.length === 1 ? '' : 's'} - unassign it from them first.`);
  }
  await db.delete(schema.roles).where(eq(schema.roles.id, role.id));
}
