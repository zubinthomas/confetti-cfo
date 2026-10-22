// Checks migration 0052 (Restaurant -> Restaurant + Reservation + GuestRegister)
// against a throwaway PGlite dir: a database at migration 0051 holding
// Restaurant grants gets every holder copied to the two new resources with the
// same effect, and nobody gains or loses access. Then the permission checks the
// routes rely on, for register-only, reservation-only and catalog-only users.
//   node db/verify-reservation-permissions.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reservation-permissions-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { db, schema } = await import('./client.ts');
const { migrate } = await import('drizzle-orm/pglite/migrator');
const { sql, eq, and } = await import('drizzle-orm');
const P = await import('./permissions.ts');

// A migrations folder cut off at 0051, so we can plant fixtures and then apply 0052.
const FULL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const CUT = fs.mkdtempSync(path.join(os.tmpdir(), 'reservation-permissions-verify-mig-'));
fs.cpSync(FULL, CUT, { recursive: true });
const journalPath = path.join(CUT, 'meta', '_journal.json');
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
const cut = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0052_'));
assert.ok(cut > 0, '0052 is in the journal');
journal.entries = journal.entries.slice(0, cut);
fs.writeFileSync(journalPath, JSON.stringify(journal));
await migrate(db, { migrationsFolder: CUT });

// Pre-0052 world: only Restaurant permission rows exist.
const old = new Map<string, number>();
for (const action of P.ACTIONS) {
  const [row] = await db.insert(schema.permissions).values({ resource: 'Restaurant', action }).returning();
  old.set(action, row.id);
}
const [other] = await db.insert(schema.permissions).values({ resource: 'Inventory', action: 'read' }).returning();

const now = new Date().toISOString();
const mkRole = async (name: string, rank: number) =>
  (await db.insert(schema.roles).values({ name, rank, createdAt: now }).returning())[0];
const mkUser = async (email: string) =>
  (await db.insert(schema.users).values({ email, passwordHash: 'x', createdAt: now }).returning())[0];

const full = await mkRole('Full', 10);
const readOnly = await mkRole('ReadOnly', 20);
const denied = await mkRole('Denied', 30);
for (const a of P.ACTIONS) await db.insert(schema.rolePermissions).values({ roleId: full.id, permissionId: old.get(a)!, effect: 'allow' });
await db.insert(schema.rolePermissions).values({ roleId: readOnly.id, permissionId: old.get('read')!, effect: 'allow' });
await db.insert(schema.rolePermissions).values({ roleId: denied.id, permissionId: old.get('delete')!, effect: 'deny' });
await db.insert(schema.rolePermissions).values({ roleId: full.id, permissionId: other.id, effect: 'allow' });

const direct = await mkUser('direct@x.test');
await db.insert(schema.userPermissions).values({ userId: direct.id, permissionId: old.get('write')!, effect: 'allow' });
const directDeny = await mkUser('deny@x.test');
await db.insert(schema.userPermissions).values({ userId: directDeny.id, permissionId: old.get('read')!, effect: 'deny' });
const inviter = await mkUser('inviter@x.test');
const [invite] = await db.insert(schema.invites).values({
  email: 'new@x.test', token: 't', invitedByUserId: inviter.id, createdAt: now, expiresAt: now,
}).returning();
await db.insert(schema.invitePermissions).values({ inviteId: invite.id, permissionId: old.get('read')! });
await db.insert(schema.permissionLayouts).values({
  permissionId: old.get('read')!, priority: 1, config: {} as never, updatedAt: now,
});

// Apply 0052 for real, then the boot seeder, as the server does.
await migrate(db, { migrationsFolder: FULL });
await P.seedPermissionsCatalog();

const permId = async (resource: string, action: string) => {
  const [r] = await db.select().from(schema.permissions)
    .where(and(eq(schema.permissions.resource, resource), eq(schema.permissions.action, action)));
  assert.ok(r, `${resource}:${action} exists`);
  return r.id;
};
const NEW = ['Reservation', 'GuestRegister'];

// No duplicate permission rows after the seeder.
const dupes = await db.execute(sql`SELECT resource, action FROM permissions GROUP BY 1, 2 HAVING count(*) > 1`);
assert.equal(dupes.rows.length, 0, 'no duplicate permission rows');
for (const r of NEW) for (const a of P.ACTIONS) await permId(r, a);

const roleEffect = async (roleId: number, resource: string, action: string) =>
  (await db.select({ e: schema.rolePermissions.effect }).from(schema.rolePermissions)
    .where(and(eq(schema.rolePermissions.roleId, roleId), eq(schema.rolePermissions.permissionId, await permId(resource, action)))))[0]?.e;

for (const r of ['Restaurant', ...NEW]) {
  for (const a of P.ACTIONS) assert.equal(await roleEffect(full.id, r, a), 'allow', `Full has ${r}:${a}`);
  assert.equal(await roleEffect(readOnly.id, r, 'read'), 'allow', `ReadOnly has ${r}:read`);
  assert.equal(await roleEffect(readOnly.id, r, 'write'), undefined, `ReadOnly has no ${r}:write`);
  assert.equal(await roleEffect(denied.id, r, 'delete'), 'deny', `Denied denies ${r}:delete`);
  assert.equal(await roleEffect(denied.id, r, 'read'), undefined, `Denied has no opinion on ${r}:read`);
}
assert.equal(await roleEffect(full.id, 'Inventory', 'read'), 'allow', 'unrelated grant untouched');

const userEffect = async (userId: number, resource: string, action: string) =>
  (await db.select({ e: schema.userPermissions.effect }).from(schema.userPermissions)
    .where(and(eq(schema.userPermissions.userId, userId), eq(schema.userPermissions.permissionId, await permId(resource, action)))))[0]?.e;
for (const r of ['Restaurant', ...NEW]) {
  assert.equal(await userEffect(direct.id, r, 'write'), 'allow', `direct allow copied for ${r}`);
  assert.equal(await userEffect(directDeny.id, r, 'read'), 'deny', `direct deny copied for ${r}`);
}
const invited = await db.select({ id: schema.invitePermissions.permissionId }).from(schema.invitePermissions)
  .where(eq(schema.invitePermissions.inviteId, invite.id));
assert.deepEqual(
  invited.map((i) => i.id).sort(),
  [await permId('Restaurant', 'read'), await permId('Reservation', 'read'), await permId('GuestRegister', 'read')].sort(),
  'pending invite carries all three read permissions',
);
const layouts = await db.select().from(schema.permissionLayouts);
assert.equal(layouts.length, 1, 'permission layouts are not copied');

// Admin and Viewer, re-synced by the seeder, cover the new resources.
const roleHas = async (roleName: string, resource: string, action: string) => {
  const [r] = await db.select().from(schema.roles).where(eq(schema.roles.name, roleName));
  return (await roleEffect(r.id, resource, action)) === 'allow';
};
for (const r of NEW) {
  for (const a of P.ACTIONS) assert.ok(await roleHas('Admin', r, a), `Admin has ${r}:${a}`);
  assert.ok(await roleHas('Viewer', r, 'read'), `Viewer has ${r}:read`);
  assert.ok(!(await roleHas('Viewer', r, 'write')), `Viewer has no ${r}:write`);
}

// Re-running the migration SQL changes nothing.
const count = async () => ({
  rp: (await db.execute(sql`SELECT count(*)::int AS n FROM role_permissions`)).rows[0].n,
  up: (await db.execute(sql`SELECT count(*)::int AS n FROM user_permissions`)).rows[0].n,
  ip: (await db.execute(sql`SELECT count(*)::int AS n FROM invite_permissions`)).rows[0].n,
  p: (await db.execute(sql`SELECT count(*)::int AS n FROM permissions`)).rows[0].n,
});
const before = await count();
const body = fs.readFileSync(path.join(FULL, '0052_restaurant_permissions.sql'), 'utf8');
for (const stmt of body.split('--> statement-breakpoint')) await db.execute(sql.raw(stmt));
assert.deepEqual(await count(), before, 're-running 0052 is a no-op');

// Combinations the routes depend on. Each user gets a direct allow set.
const grant = async (userId: number, perms: [string, string][]) => {
  for (const [r, a] of perms) {
    await db.insert(schema.userPermissions)
      .values({ userId, permissionId: await permId(r, a), effect: 'allow' });
  }
};
const has = (userId: number, r: string, a: string) => P.hasPermission(userId, r as never, a as never);

const register = await mkUser('register@x.test');
await grant(register.id, [['GuestRegister', 'read'], ['GuestRegister', 'write']]);
assert.ok(await has(register.id, 'GuestRegister', 'write'));
assert.ok(!(await has(register.id, 'GuestRegister', 'delete')), 'register-only user cannot delete sign-ins');
assert.ok(!(await has(register.id, 'Reservation', 'read')), 'register-only user cannot read bookings');
assert.ok(!(await has(register.id, 'Restaurant', 'write')), 'register-only user cannot edit the catalog');

const booker = await mkUser('booker@x.test');
await grant(booker.id, [['Reservation', 'read'], ['Reservation', 'write'], ['Reservation', 'delete']]);
assert.ok(await has(booker.id, 'Reservation', 'delete'));
assert.ok(!(await has(booker.id, 'GuestRegister', 'read')), 'reservation-only user cannot read the register');
assert.ok(!(await has(booker.id, 'Restaurant', 'delete')), 'reservation-only user cannot archive tables');

const catalog = await mkUser('catalog@x.test');
await grant(catalog.id, [['Restaurant', 'read'], ['Restaurant', 'write'], ['Restaurant', 'delete']]);
assert.ok(await has(catalog.id, 'Restaurant', 'delete'));
assert.ok(!(await has(catalog.id, 'Reservation', 'delete')), 'catalog-only user cannot delete bookings');
assert.ok(!(await has(catalog.id, 'GuestRegister', 'delete')), 'catalog-only user cannot delete sign-ins');

console.log('reservation-permissions:verify OK');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(CUT, { recursive: true, force: true });
process.exit(0);
