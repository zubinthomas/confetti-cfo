// DB-level checks for layouts against a throwaway PGlite dir: structural
// validation, upsert/clear for user/role/permission layouts, the order the
// layers come back in, which permission layers a user qualifies for, and
// cascade deletes.
//   node db/verify-layouts.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Point the db client at a throwaway PGlite dir BEFORE importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layouts-verify-pg-'));
process.env.PGLITE_DATA_DIR = dir;

const { ready, db, schema } = await import('./client.ts');
const {
  validateLayout, LayoutError, getLayoutLayers, listLayouts, setUserLayout, clearUserLayout,
  setRoleLayout, clearRoleLayout, setPermissionLayout, clearPermissionLayout,
} = await import('./layouts.ts');
const { eq } = await import('drizzle-orm');

await ready();
const now = new Date().toISOString();

const throwsLayout = async (fn: () => unknown, label: string) => {
  await assert.rejects(async () => { await fn(); }, (e) => e instanceof LayoutError, label);
};

// ── Validation ───────────────────────────────────────────────────────────────
const good = {
  v: 1,
  nav: { items: { hr: { hidden: true, placement: 'sidebar' } }, order: { sidebar: ['hr', 'overview'] } },
  tabs: { hr: { hidden: ['roster'], shown: ['leave'], order: ['leave'], default: 'leave' } },
  widgets: { overview: { hidden: ['x'], shown: ['y'], order: ['a', 'b'], width: { a: 'half' } } },
};
assert.deepEqual(validateLayout(good), good, 'a well-formed layout round-trips unchanged');
assert.deepEqual(validateLayout({ v: 1 }), { v: 1 }, 'an empty layout is valid');

await throwsLayout(() => validateLayout(null), 'null');
await throwsLayout(() => validateLayout([]), 'array');
await throwsLayout(() => validateLayout({ v: 2 }), 'wrong version');
await throwsLayout(() => validateLayout({ v: 1, extra: 1 }), 'unknown top-level field');
await throwsLayout(() => validateLayout({ v: 1, nav: { items: { hr: { hidden: 'yes' } } } }), 'non-boolean hidden');
await throwsLayout(() => validateLayout({ v: 1, nav: { items: { hr: { placement: 'footer' } } } }), 'bad placement');
await throwsLayout(() => validateLayout({ v: 1, nav: { order: { footer: [] } } }), 'bad order key');
await throwsLayout(() => validateLayout({ v: 1, nav: { order: { sidebar: [1] } } }), 'non-string id');
await throwsLayout(() => validateLayout({ v: 1, nav: { items: { 'bad id!': {} } } }), 'id with illegal characters');
await throwsLayout(() => validateLayout({ v: 1, widgets: { o: { width: { a: 'huge' } } } }), 'bad width');
await throwsLayout(() => validateLayout({ v: 1, tabs: { hr: { default: 5 } } }), 'non-string default tab');
await throwsLayout(() => validateLayout({ v: 1, nav: { order: { sidebar: Array.from({ length: 201 }, (_, i) => `i${i}`) } } }), 'too many entries');
const bulky = Object.fromEntries(['p1', 'p2', 'p3', 'p4'].map((page) => [page, { hidden: Array.from({ length: 200 }, () => 'x'.repeat(64)) }]));
await throwsLayout(() => validateLayout({ v: 1, tabs: bulky }), 'too large');

// ── Fixture ──────────────────────────────────────────────────────────────────
const [alice] = await db.insert(schema.users).values({ email: 'alice@example.com', passwordHash: 'x', createdAt: now }).returning();
const [bob] = await db.insert(schema.users).values({ email: 'bob@example.com', passwordHash: 'x', createdAt: now }).returning();
const [high] = await db.insert(schema.roles).values({ name: 'High', rank: 10, createdAt: now }).returning();
const [low] = await db.insert(schema.roles).values({ name: 'Low', rank: 50, createdAt: now }).returning();
await db.insert(schema.userRoles).values([
  { userId: alice.id, roleId: high.id },
  { userId: alice.id, roleId: low.id },
]);
const grant = async (userId: number, resource: string, action: string) => {
  const rows = await db.select().from(schema.permissions);
  const p = rows.find((r) => r.resource === resource && r.action === action)!;
  await db.insert(schema.userPermissions).values({ userId, permissionId: p.id, effect: 'allow' });
};
await grant(alice.id, 'Reservation', 'read');
await grant(alice.id, 'Inventory', 'read');

const layout = (id: string) => ({ v: 1 as const, nav: { items: { [id]: { hidden: true } } } });

// ── Nothing stored yet ───────────────────────────────────────────────────────
assert.deepEqual(await getLayoutLayers(alice.id), { permission: [], roles: [], user: null });

// ── Own layout: upsert, replace, clear ───────────────────────────────────────
await setUserLayout(alice.id, layout('a'));
await setUserLayout(alice.id, layout('b'));
assert.deepEqual((await getLayoutLayers(alice.id)).user, layout('b'), 'second save replaces the first');
assert.equal((await db.select().from(schema.userLayouts)).length, 1, 'one row per user');
await throwsLayout(() => setUserLayout(alice.id, { v: 9 }), 'invalid own layout rejected');
await clearUserLayout(alice.id);
assert.equal((await getLayoutLayers(alice.id)).user, null, 'cleared');
await clearUserLayout(alice.id); // clearing nothing is fine

// ── Role layouts: applied lowest-priority first ──────────────────────────────
await setRoleLayout(bob.id, high.id, layout('high'));
await setRoleLayout(bob.id, low.id, layout('low'));
await throwsLayout(() => setRoleLayout(bob.id, 9999, layout('x')), 'unknown role');
let layers = await getLayoutLayers(alice.id);
assert.deepEqual(layers.roles.map((r) => r.roleId), [low.id, high.id], 'rank 50 applies before rank 10, so rank 10 wins');
assert.deepEqual((await getLayoutLayers(bob.id)).roles, [], 'a user without the role gets none of its layouts');

// ── Permission layouts: only held permissions, higher number first ───────────
await setPermissionLayout(bob.id, 'Reservation', 'read', 5, layout('res'));
await setPermissionLayout(bob.id, 'Inventory', 'read', 20, layout('inv'));
await setPermissionLayout(bob.id, 'Operations', 'read', 1, layout('ops'));
await throwsLayout(() => setPermissionLayout(bob.id, 'Nope', 'read', 1, layout('x')), 'unknown permission');
await throwsLayout(() => setPermissionLayout(bob.id, 'Reservation', 'read', -1, layout('x')), 'negative priority');
await throwsLayout(() => setPermissionLayout(bob.id, 'Reservation', 'read', 1.5, layout('x')), 'fractional priority');
await throwsLayout(() => setPermissionLayout(bob.id, 'Reservation', 'read', '1', layout('x')), 'string priority');
layers = await getLayoutLayers(alice.id);
assert.deepEqual(layers.permission.map((p) => p.key), ['Inventory:read', 'Reservation:read'],
  'Operations:read is not held, and priority 20 applies before priority 5 so 5 wins');
await setPermissionLayout(bob.id, 'Inventory', 'read', 3, layout('inv2'));
assert.deepEqual((await getLayoutLayers(alice.id)).permission.map((p) => p.key), ['Reservation:read', 'Inventory:read'],
  're-saving with a lower number makes it win');
assert.equal((await db.select().from(schema.permissionLayouts)).length, 3, 'one row per permission');

// A deny overrides a role grant, so the layout no longer applies
await db.insert(schema.userPermissions).values({
  userId: alice.id,
  permissionId: (await db.select().from(schema.permissions)).find((r) => r.resource === 'Inventory' && r.action === 'read')!.id,
  effect: 'deny',
}).onConflictDoUpdate({
  target: [schema.userPermissions.userId, schema.userPermissions.permissionId], set: { effect: 'deny' },
});
assert.deepEqual((await getLayoutLayers(alice.id)).permission.map((p) => p.key), ['Reservation:read'], 'denied permission drops its layout');

// ── Admin listing ────────────────────────────────────────────────────────────
const listed = await listLayouts();
assert.deepEqual(listed.roles.map((r) => r.roleName), ['High', 'Low'], 'roles listed by rank');
assert.deepEqual(listed.permissions.map((p) => `${p.resource}:${p.action}`), ['Operations:read', 'Inventory:read', 'Reservation:read'],
  'permissions listed by priority, lowest number first');

// ── Clearing and cascades ────────────────────────────────────────────────────
await clearPermissionLayout('Operations', 'read');
await clearRoleLayout(low.id);
assert.deepEqual((await getLayoutLayers(alice.id)).roles.map((r) => r.roleId), [high.id]);

await setUserLayout(bob.id, layout('bob'));
await db.delete(schema.roles).where(eq(schema.roles.id, high.id));
assert.equal((await db.select().from(schema.roleLayouts)).length, 0, 'deleting a role removes its layout');
await db.delete(schema.users).where(eq(schema.users.id, bob.id));
assert.equal((await db.select().from(schema.userLayouts)).length, 0, 'deleting a user removes their layout');
// bob authored permission layouts: the audit column is set null, not cascaded
const remaining = await db.select().from(schema.permissionLayouts);
assert.equal(remaining.length, 2, 'permission layouts survive their editor being deleted');
assert.ok(remaining.every((r) => r.updatedByUserId === null), 'editor reference nulled');

// ── Leadership preset seed ───────────────────────────────────────────────────
const { applyLeadershipLayoutSeed } = await import('./seed-leadership-layout.ts');
assert.equal(await applyLeadershipLayoutSeed(), 'no-role', 'nothing to do without a Leadership role');
const [lead] = await db.insert(schema.roles).values({ name: 'Leadership', rank: 777, createdAt: now }).returning();
assert.equal(await applyLeadershipLayoutSeed(), 'created');
const seeded = await db.select().from(schema.roleLayouts).where(eq(schema.roleLayouts.roleId, lead.id));
assert.equal(seeded.length, 1);
assert.ok(seeded[0].config.widgets?.overview?.shown?.includes('leadership.header'), 'preset shows the leadership widgets');
assert.ok(seeded[0].config.widgets?.overview?.hidden?.includes('group.header'), 'preset hides the group widgets');
await setRoleLayout(alice.id, lead.id, layout('edited'));
assert.equal(await applyLeadershipLayoutSeed(), 'kept', 're-running keeps an admin\'s edits');
assert.equal(await applyLeadershipLayoutSeed(true), 'replaced', '--force restores the preset');

console.log('layouts verify: all checks passed');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
