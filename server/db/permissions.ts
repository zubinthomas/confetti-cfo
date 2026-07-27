// RBAC resource/action catalog + resolution. The catalog is owned by code
// (it mirrors the route files exactly - one resource per data domain) and is
// upserted into the `permissions` table on every boot (see seedPermissionsCatalog,
// called from client.ts's ready()) purely so role_permissions has a real FK
// target - the catalog itself is never edited through the DB.
import { and, desc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

// Reference (server/routes/reference.ts) is deliberately excluded: it's
// organizational taxonomy, not financial data, fetched as a prerequisite by
// every dashboard page before any per-route permission check runs (see
// ReferenceDataGate in src/App.tsx) - gating it would lock any narrowly-
// scoped role out of the whole dashboard shell. It's open to any
// authenticated user instead, so it isn't part of this catalog.
export const RESOURCES = [
  'Employee', 'Licence', 'Recruitment', 'LeaveRequest',
  'FinancialRecord', 'SalesRecord', 'ConsignmentRecord', 'Operations',
  'Import', 'SheetSource', 'Integration', 'Settings', 'Invite', 'User', 'Role',
] as const;
export type Resource = typeof RESOURCES[number];

export const ACTIONS = ['read', 'write', 'delete'] as const;
export type Action = typeof ACTIONS[number];

export type Perm = { resource: Resource; action: Action };

/** A caller tried to grant a permission they don't hold themselves - see
 *  assertGrantable below. */
export class PermissionGrantError extends Error {}

const FULL_CRUD: Resource[] = ['Employee', 'Licence', 'Recruitment', 'LeaveRequest', 'Import', 'SheetSource', 'Invite', 'User', 'Role'];
const READ_ONLY: Resource[] = ['FinancialRecord', 'SalesRecord', 'ConsignmentRecord', 'Operations', 'Settings'];
const READ_WRITE: Resource[] = ['Integration'];

export const PERMISSIONS_CATALOG: { resource: Resource; action: Action }[] = [
  ...FULL_CRUD.flatMap((resource) => ACTIONS.map((action) => ({ resource, action }))),
  ...READ_ONLY.map((resource) => ({ resource, action: 'read' as const })),
  ...READ_WRITE.flatMap((resource) => (['read', 'write'] as const).map((action) => ({ resource, action }))),
];

const ADMIN_ROLE = 'Admin';
const VIEWER_ROLE = 'Viewer';
const ADMIN_RANK = 100;
const VIEWER_RANK = 0;

async function upsertRole(name: string, rank: number) {
  const now = new Date().toISOString();
  await db.insert(schema.roles).values({ name, rank, createdAt: now })
    .onConflictDoNothing({ target: schema.roles.name });
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
  return role;
}

/** Upserts the fixed permission catalog and seeds the default Admin (allow-all)
 *  and Viewer (read-only allow-all) roles. Deterministic and code-only, so
 *  unlike the settings/dataset seeds this runs unconditionally on every boot.
 *  Only ever called from client.ts's ready(), after migrate() has already
 *  resolved - it must NOT call ready() itself, which would await the very
 *  promise chain it's running inside of and deadlock. */
export async function seedPermissionsCatalog() {
  for (const { resource, action } of PERMISSIONS_CATALOG) {
    await db.insert(schema.permissions).values({ resource, action })
      .onConflictDoNothing({ target: [schema.permissions.resource, schema.permissions.action] });
  }
  const allPerms = await db.select().from(schema.permissions);

  const admin = await upsertRole(ADMIN_ROLE, ADMIN_RANK);
  const viewer = await upsertRole(VIEWER_ROLE, VIEWER_RANK);

  for (const p of allPerms) {
    await db.insert(schema.rolePermissions)
      .values({ roleId: admin.id, permissionId: p.id, effect: 'allow' })
      .onConflictDoUpdate({
        target: [schema.rolePermissions.roleId, schema.rolePermissions.permissionId],
        set: { effect: 'allow' },
      });
  }
  for (const p of allPerms.filter((p) => p.action === 'read')) {
    await db.insert(schema.rolePermissions)
      .values({ roleId: viewer.id, permissionId: p.id, effect: 'allow' })
      .onConflictDoUpdate({
        target: [schema.rolePermissions.roleId, schema.rolePermissions.permissionId],
        set: { effect: 'allow' },
      });
  }
}

/** A user's direct (resource, action) opinion, if any - always takes
 *  precedence over role-based resolution (see hasPermission below). This is
 *  what an accepted invite's permissions become, and what the
 *  user-permission:* CLI commands manage directly. */
async function directEffect(userId: number, resource: Resource, action: Action): Promise<'allow' | 'deny' | undefined> {
  const [row] = await db
    .select({ effect: schema.userPermissions.effect })
    .from(schema.userPermissions)
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.userPermissions.permissionId))
    .where(and(
      eq(schema.userPermissions.userId, userId),
      eq(schema.permissions.resource, resource),
      eq(schema.permissions.action, action),
    ));
  return row?.effect;
}

/** Resolves whether a user has (resource, action). Two tiers: a direct
 *  per-user grant/deny (user_permissions) always wins if present - it's the
 *  most specific statement about this exact user. Otherwise, among the
 *  user's assigned roles, the highest-ranked role with an explicit opinion
 *  wins. No opinion anywhere defaults to deny (fail closed). */
export async function hasPermission(userId: number, resource: Resource, action: Action): Promise<boolean> {
  await ready();
  const direct = await directEffect(userId, resource, action);
  if (direct) return direct === 'allow';

  const [row] = await db
    .select({ effect: schema.rolePermissions.effect })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.roles.id))
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
    .where(and(
      eq(schema.userRoles.userId, userId),
      eq(schema.permissions.resource, resource),
      eq(schema.permissions.action, action),
    ))
    .orderBy(desc(schema.roles.rank))
    .limit(1);
  return row?.effect === 'allow';
}

/** All of a user's effective (allowed) permissions, one entry per resource:action -
 *  used by GET /auth/me and the user:permissions CLI command. Direct grants
 *  override role-derived ones key-for-key, same precedence as hasPermission. */
export async function getEffectivePermissions(userId: number): Promise<{ resource: Resource; action: Action }[]> {
  await ready();
  const roleRows = await db
    .select({
      resource: schema.permissions.resource,
      action: schema.permissions.action,
      effect: schema.rolePermissions.effect,
      rank: schema.roles.rank,
    })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.roles.id))
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
    .where(eq(schema.userRoles.userId, userId));

  const byKey = new Map<string, { resource: Resource; action: Action; effect: 'allow' | 'deny'; rank: number }>();
  for (const row of roleRows) {
    const key = `${row.resource}:${row.action}`;
    const existing = byKey.get(key);
    if (!existing || row.rank > existing.rank) byKey.set(key, row as never);
  }
  const effectByKey = new Map<string, 'allow' | 'deny'>();
  for (const [key, v] of byKey) effectByKey.set(key, v.effect);

  const directRows = await getUserDirectPermissions(userId);
  for (const row of directRows) effectByKey.set(`${row.resource}:${row.action}`, row.effect);

  return [...effectByKey.entries()]
    .filter(([, effect]) => effect === 'allow')
    .map(([key]) => {
      const [resource, action] = key.split(':') as [Resource, Action];
      return { resource, action };
    });
}

/** A user's raw direct grants/denies (not merged with role-derived ones) -
 *  used by the user-permission:show CLI command. */
export async function getUserDirectPermissions(userId: number): Promise<{ resource: Resource; action: Action; effect: 'allow' | 'deny' }[]> {
  await ready();
  const rows = await db
    .select({
      resource: schema.permissions.resource,
      action: schema.permissions.action,
      effect: schema.userPermissions.effect,
    })
    .from(schema.userPermissions)
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.userPermissions.permissionId))
    .where(eq(schema.userPermissions.userId, userId));
  return rows as { resource: Resource; action: Action; effect: 'allow' | 'deny' }[];
}

/** Throws if any of `wanted` isn't in the requesting user's own current
 *  effective permissions - live-checked, never trusted from stale data.
 *  Shared by the invite system (server/db/invites.ts) and user management
 *  (server/db/userAccounts.ts). Callers *replacing* an existing grant set
 *  (as opposed to creating a fresh one) must exclude already-granted entries
 *  the requesting user doesn't hold ("locked" entries) from `wanted` before
 *  calling this, then merge those locked entries back in untouched - passing
 *  the full replacement set here would wrongly reject an edit that doesn't
 *  even touch the locked portion. */
export async function assertGrantable(userId: number, wanted: Perm[]) {
  const held = new Set((await getEffectivePermissions(userId)).map((p) => `${p.resource}:${p.action}`));
  const missing = wanted.filter((p) => !held.has(`${p.resource}:${p.action}`));
  if (missing.length > 0) {
    throw new PermissionGrantError(`You don't hold these permissions yourself, so you can't grant them: ${missing.map((p) => `${p.resource}:${p.action}`).join(', ')}`);
  }
}

/** Every role with its allow-listed permissions - used by GET /api/roles,
 *  purely as a client-side preset picker for the invite-creation form
 *  (picking a role there just prechecks its boxes; the invite itself never
 *  references a role afterward). */
export async function listRolesWithPermissions(): Promise<{ id: number; name: string; rank: number; permissions: { resource: Resource; action: Action }[] }[]> {
  await ready();
  const roleRows = await db.select().from(schema.roles).orderBy(desc(schema.roles.rank));
  const grantRows = await db
    .select({
      roleId: schema.rolePermissions.roleId,
      resource: schema.permissions.resource,
      action: schema.permissions.action,
      effect: schema.rolePermissions.effect,
    })
    .from(schema.rolePermissions)
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId));

  return roleRows.map((role) => ({
    id: role.id,
    name: role.name,
    rank: role.rank,
    permissions: grantRows
      .filter((g) => g.roleId === role.id && g.effect === 'allow')
      .map(({ resource, action }) => ({ resource: resource as Resource, action: action as Action })),
  }));
}
