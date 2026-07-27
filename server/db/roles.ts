// Role/permission management CLI (RBAC is dormant until enforcement is wired
// onto the routers). Stop the dev server first - PGlite is single-process,
// and the lockfile in client.ts will refuse to run otherwise.
//   node db/roles.ts role:create <name> --rank <n>
//   node db/roles.ts role:list
//   node db/roles.ts role:delete <name>
//   node db/roles.ts role:set-rank <name> <rank>
//   node db/roles.ts permission:list
//   node db/roles.ts permission:grant <role> <resource> <action>
//   node db/roles.ts permission:deny <role> <resource> <action>
//   node db/roles.ts permission:clear <role> <resource> <action>
//   node db/roles.ts role:assign <email> <role>
//   node db/roles.ts role:unassign <email> <role>
//   node db/roles.ts role:show <role>
//   node db/roles.ts user:permissions <email>
import { and, eq } from 'drizzle-orm';
import { db, ready, schema, close } from './client.ts';
import {
  RESOURCES, ACTIONS, PERMISSIONS_CATALOG, getEffectivePermissions,
  type Resource, type Action,
} from './permissions.ts';

const USAGE = `usage: node db/roles.ts <command>   (stop the dev server first)

  role:create <name> --rank <n>              add a role at the given rank (higher wins conflicts)
  role:list                                  show all roles, highest rank first
  role:delete <name>                         remove a role
  role:set-rank <name> <rank>                change a role's rank

  permission:list                            show the fixed resource:action catalog
  permission:grant <role> <resource> <action>  set a role's explicit ALLOW
  permission:deny  <role> <resource> <action>  set a role's explicit DENY
  permission:clear <role> <resource> <action>  remove the explicit setting (role has no opinion)

  role:assign   <email> <role>               add a role to a user
  role:unassign <email> <role>               remove a role from a user
  role:show <role>                           a role's full permission table (allow/deny/unset)
  user:permissions <email>                   a user's RESOLVED effective permissions

Resources: ${RESOURCES.join(', ')}
Actions: ${ACTIONS.join(', ')}`;

// pull `--rank <n>` out of argv, leaving positional args
const argv = process.argv.slice(2);
let rankArg: string | undefined;
const rankIdx = argv.indexOf('--rank');
if (rankIdx !== -1) {
  rankArg = argv[rankIdx + 1];
  argv.splice(rankIdx, 2);
}
const [command, arg1, arg2, arg3] = argv;

const fail = (msg: string): never => { console.error(`error: ${msg}`); process.exit(1); };

const findRole = async (name: string) => {
  const [r] = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
  return r;
};

const findUser = async (mail: string) => {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, mail));
  return u;
};

const requireRole = async (name: string | undefined) => {
  if (!name) { console.error(USAGE); process.exit(1); }
  const role = await findRole(name);
  if (!role) fail(`no role named "${name}"`);
  return role!;
};

const requireUser = async (mail: string | undefined) => {
  if (!mail) { console.error(USAGE); process.exit(1); }
  const user = await findUser(mail.toLowerCase());
  if (!user) fail(`no user with email ${mail}`);
  return user!;
};

function requireResourceAction(resource: string | undefined, action: string | undefined): { resource: Resource; action: Action } {
  if (!resource || !action) { console.error(USAGE); process.exit(1); }
  if (!RESOURCES.includes(resource as Resource)) fail(`unknown resource "${resource}" - one of: ${RESOURCES.join(', ')}`);
  if (!ACTIONS.includes(action as Action)) fail(`unknown action "${action}" - one of: ${ACTIONS.join(', ')}`);
  if (!PERMISSIONS_CATALOG.some((p) => p.resource === resource && p.action === action)) {
    fail(`${resource}:${action} is not in the permission catalog`);
  }
  return { resource: resource as Resource, action: action as Action };
}

const findPermissionRow = async (resource: Resource, action: Action) => {
  const [p] = await db.select().from(schema.permissions)
    .where(and(eq(schema.permissions.resource, resource), eq(schema.permissions.action, action)));
  return p;
};

async function setEffect(roleName: string, resourceArg: string | undefined, actionArg: string | undefined, effect: 'allow' | 'deny') {
  const role = await requireRole(roleName);
  const { resource, action } = requireResourceAction(resourceArg, actionArg);
  const permission = await findPermissionRow(resource, action);
  if (!permission) fail(`${resource}:${action} was not found in the permissions table (seed may not have run yet)`);
  await db.insert(schema.rolePermissions)
    .values({ roleId: role.id, permissionId: permission!.id, effect })
    .onConflictDoUpdate({
      target: [schema.rolePermissions.roleId, schema.rolePermissions.permissionId],
      set: { effect },
    });
  console.log(`${role.name}: ${resource}:${action} -> ${effect}`);
}

await ready();

switch (command) {
  case 'role:create': {
    if (!arg1) { console.error(USAGE); process.exit(1); }
    if (await findRole(arg1)) fail(`a role named "${arg1}" already exists`);
    if (!rankArg) fail('--rank <n> is required');
    const rank = Number(rankArg);
    if (!Number.isInteger(rank)) fail('--rank must be an integer');
    const [existing] = await db.select().from(schema.roles).where(eq(schema.roles.rank, rank));
    if (existing) fail(`rank ${rank} is already used by role "${existing.name}" - ranks must be unique`);
    const [r] = await db.insert(schema.roles).values({
      name: arg1, rank, createdAt: new Date().toISOString(),
    }).returning();
    console.log(`created role #${r.id} ${r.name} (rank ${r.rank})`);
    break;
  }
  case 'role:list': {
    const rows = await db.select().from(schema.roles).orderBy(schema.roles.rank);
    if (rows.length === 0) console.log('no roles');
    else for (const r of rows.reverse()) console.log(`#${r.id}\t${r.name}\trank ${r.rank}`);
    break;
  }
  case 'role:delete': {
    const role = await requireRole(arg1);
    await db.delete(schema.roles).where(eq(schema.roles.id, role.id));
    console.log(`deleted role ${role.name}`);
    break;
  }
  case 'role:set-rank': {
    const role = await requireRole(arg1);
    if (!arg2) { console.error(USAGE); process.exit(1); }
    const rank = Number(arg2);
    if (!Number.isInteger(rank)) fail('<rank> must be an integer');
    const [existing] = await db.select().from(schema.roles).where(eq(schema.roles.rank, rank));
    if (existing && existing.id !== role.id) fail(`rank ${rank} is already used by role "${existing.name}" - ranks must be unique`);
    await db.update(schema.roles).set({ rank }).where(eq(schema.roles.id, role.id));
    console.log(`${role.name}: rank -> ${rank}`);
    break;
  }
  case 'permission:list': {
    for (const { resource, action } of PERMISSIONS_CATALOG) console.log(`${resource}:${action}`);
    break;
  }
  case 'permission:grant': await setEffect(arg1, arg2, arg3, 'allow'); break;
  case 'permission:deny': await setEffect(arg1, arg2, arg3, 'deny'); break;
  case 'permission:clear': {
    const role = await requireRole(arg1);
    const { resource, action } = requireResourceAction(arg2, arg3);
    const permission = await findPermissionRow(resource, action);
    if (!permission) fail(`${resource}:${action} was not found in the permissions table (seed may not have run yet)`);
    const deleted = await db.delete(schema.rolePermissions)
      .where(and(eq(schema.rolePermissions.roleId, role.id), eq(schema.rolePermissions.permissionId, permission!.id)))
      .returning();
    console.log(deleted.length > 0
      ? `${role.name}: ${resource}:${action} -> cleared (no explicit setting)`
      : `${role.name} had no explicit setting for ${resource}:${action}`);
    break;
  }
  case 'role:assign': {
    const user = await requireUser(arg1);
    const role = await requireRole(arg2);
    await db.insert(schema.userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing({
      target: [schema.userRoles.userId, schema.userRoles.roleId],
    });
    console.log(`${user.email}: assigned role ${role.name}`);
    break;
  }
  case 'role:unassign': {
    const user = await requireUser(arg1);
    const role = await requireRole(arg2);
    await db.delete(schema.userRoles)
      .where(and(eq(schema.userRoles.userId, user.id), eq(schema.userRoles.roleId, role.id)));
    console.log(`${user.email}: unassigned role ${role.name}`);
    break;
  }
  case 'role:show': {
    const role = await requireRole(arg1);
    const grants = await db.select({ resource: schema.permissions.resource, action: schema.permissions.action, effect: schema.rolePermissions.effect })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
      .where(eq(schema.rolePermissions.roleId, role.id));
    const byKey = new Map(grants.map((g) => [`${g.resource}:${g.action}`, g.effect]));
    console.log(`${role.name} (rank ${role.rank}):`);
    for (const { resource, action } of PERMISSIONS_CATALOG) {
      const key = `${resource}:${action}`;
      console.log(`  ${key.padEnd(28)} ${byKey.get(key) ?? '(unset)'}`);
    }
    break;
  }
  case 'user:permissions': {
    const user = await requireUser(arg1);
    const effective = await getEffectivePermissions(user.id);
    if (effective.length === 0) console.log(`${user.email}: no permissions (no roles assigned, or no role grants anything)`);
    else {
      console.log(`${user.email}:`);
      for (const { resource, action } of effective) console.log(`  ${resource}:${action}`);
    }
    break;
  }
  default:
    console.error(USAGE);
    process.exit(1);
}

await close();
process.exit(0);
