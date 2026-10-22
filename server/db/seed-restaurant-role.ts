// One-off seed: a "Restaurant" role with full access to the Restaurant module
// (guest register, reservations, locations/areas/tables) and nothing else. That
// is read/write/delete on Restaurant, Reservation and GuestRegister.
// Someone with only this role has a single nav item, so the shell shows no
// navigation beyond the user menu and they land straight on /restaurant.
//
// Run per database: `npm run db:seed-restaurant-role` with the server stopped
// (PGlite is single-process - see client.ts). Safe to re-run:
//   - an existing role keeps its rank;
//   - missing read/write/delete grants on those three resources are added;
//   - nothing is removed. Any other permission someone added to the role later
//     is reported and left alone.
// A new role gets the next free rank above the existing ones (ranks are
// unique, lower wins conflicts), so it never outranks Admin or Viewer.
import { pathToFileURL } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { ACTIONS } from './permissions.ts';

export const ROLE_NAME = 'Restaurant';
const RESOURCES = ['Restaurant', 'Reservation', 'GuestRegister'];
const MIN_RANK = 200;

export interface RestaurantRoleResult {
  roleCreated: boolean;
  rank: number;
  granted: string[];
  /** Permissions on the role beyond the module ones, as "Resource:action". */
  extra: string[];
}

export async function applyRestaurantRoleSeed(): Promise<RestaurantRoleResult> {
  await ready();

  let [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, ROLE_NAME));
  const roleCreated = !role;
  if (!role) {
    const ranks = (await db.select({ rank: schema.roles.rank }).from(schema.roles)).map((r) => r.rank);
    const rank = Math.max(MIN_RANK - 100, ...ranks) + 100;
    [role] = await db.insert(schema.roles)
      .values({ name: ROLE_NAME, rank, createdAt: new Date().toISOString() })
      .returning();
  }

  const perms = await db.select().from(schema.permissions).where(inArray(schema.permissions.resource, RESOURCES));
  const have = await db
    .select({ permissionId: schema.rolePermissions.permissionId, effect: schema.rolePermissions.effect })
    .from(schema.rolePermissions)
    .where(eq(schema.rolePermissions.roleId, role.id));
  const allowed = new Set(have.filter((h) => h.effect === 'allow').map((h) => h.permissionId));

  const granted: string[] = [];
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      const perm = perms.find((p) => p.resource === resource && p.action === action);
      if (!perm) throw new Error(`Permission ${resource}:${action} is not in the catalog`);
      if (allowed.has(perm.id)) continue;
      await db.insert(schema.rolePermissions)
        .values({ roleId: role.id, permissionId: perm.id, effect: 'allow' })
        .onConflictDoUpdate({
          target: [schema.rolePermissions.roleId, schema.rolePermissions.permissionId],
          set: { effect: 'allow' },
        });
      granted.push(`${resource}:${action}`);
    }
  }

  const all = await db
    .select({ resource: schema.permissions.resource, action: schema.permissions.action })
    .from(schema.rolePermissions)
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
    .where(eq(schema.rolePermissions.roleId, role.id));
  const extra = all.filter((p) => !RESOURCES.includes(p.resource)).map((p) => `${p.resource}:${p.action}`);

  return { roleCreated, rank: role.rank, granted, extra };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await applyRestaurantRoleSeed();
  console.log(r.roleCreated ? `Created role "${ROLE_NAME}" at rank ${r.rank}.` : `Role "${ROLE_NAME}" already there (rank ${r.rank}).`);
  console.log(r.granted.length ? `Granted: ${r.granted.join(', ')}.` : 'Restaurant, Reservation and GuestRegister read/write/delete already granted.');
  if (r.extra.length) console.log(`Also on the role, left alone: ${r.extra.join(', ')}.`);
  process.exit(0);
}
