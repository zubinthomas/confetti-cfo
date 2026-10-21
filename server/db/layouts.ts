// Layout storage: one sparse config per permission, role or user. The server
// never interprets a config (the registry of nav items, tabs and widgets lives
// in the client, src/lib/layout/registry.ts) - it validates the structure,
// bounds the size, and hands the right layers to GET /auth/me. Unknown ids are
// tolerated and ignored at resolve time, so renaming a registry id never
// breaks a stored layout, it just stops applying.
import { and, asc, desc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { getEffectivePermissions } from './permissions.ts';

export class LayoutError extends Error {}

export const PLACEMENTS = ['sidebar', 'header', 'userMenu'] as const;
export const WIDTHS = ['sixth', 'third', 'half', 'full'] as const;
type Placement = typeof PLACEMENTS[number];
type Width = typeof WIDTHS[number];

export interface StoredLayout {
  v: 1;
  nav?: {
    items?: Record<string, { hidden?: boolean; placement?: Placement }>;
    order?: Partial<Record<Placement, string[]>>;
  };
  tabs?: Record<string, { hidden?: string[]; order?: string[]; default?: string }>;
  widgets?: Record<string, { hidden?: string[]; order?: string[]; width?: Record<string, Width> }>;
}

const MAX_BYTES = 20_000;
const MAX_ENTRIES = 200;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function checkKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new LayoutError(`${where}: unknown field "${k}"`);
  }
}

function asId(v: unknown, where: string): string {
  if (typeof v !== 'string' || !ID_PATTERN.test(v)) throw new LayoutError(`${where}: invalid id`);
  return v;
}

function asIdList(v: unknown, where: string): string[] {
  if (!Array.isArray(v)) throw new LayoutError(`${where} must be an array`);
  if (v.length > MAX_ENTRIES) throw new LayoutError(`${where} has too many entries`);
  return v.map((x) => asId(x, where));
}

function asRecord(v: unknown, where: string): [string, unknown][] {
  if (!isObject(v)) throw new LayoutError(`${where} must be an object`);
  const entries = Object.entries(v);
  if (entries.length > MAX_ENTRIES) throw new LayoutError(`${where} has too many entries`);
  for (const [k] of entries) asId(k, where);
  return entries;
}

/** Validates and normalises a layout config, dropping nothing silently: any
 *  unexpected field is an error, so a typo surfaces instead of being stored. */
export function validateLayout(input: unknown): StoredLayout {
  if (!isObject(input)) throw new LayoutError('layout must be an object');
  if (JSON.stringify(input).length > MAX_BYTES) throw new LayoutError('layout is too large');
  checkKeys(input, ['v', 'nav', 'tabs', 'widgets'], 'layout');
  if (input.v !== 1) throw new LayoutError('layout.v must be 1');
  const out: StoredLayout = { v: 1 };

  if (input.nav !== undefined) {
    if (!isObject(input.nav)) throw new LayoutError('nav must be an object');
    checkKeys(input.nav, ['items', 'order'], 'nav');
    const nav: NonNullable<StoredLayout['nav']> = {};
    if (input.nav.items !== undefined) {
      nav.items = {};
      for (const [id, raw] of asRecord(input.nav.items, 'nav.items')) {
        if (!isObject(raw)) throw new LayoutError(`nav.items.${id} must be an object`);
        checkKeys(raw, ['hidden', 'placement'], `nav.items.${id}`);
        const item: { hidden?: boolean; placement?: Placement } = {};
        if (raw.hidden !== undefined) {
          if (typeof raw.hidden !== 'boolean') throw new LayoutError(`nav.items.${id}.hidden must be a boolean`);
          item.hidden = raw.hidden;
        }
        if (raw.placement !== undefined) {
          if (!PLACEMENTS.includes(raw.placement as Placement)) throw new LayoutError(`nav.items.${id}.placement is not valid`);
          item.placement = raw.placement as Placement;
        }
        nav.items[id] = item;
      }
    }
    if (input.nav.order !== undefined) {
      if (!isObject(input.nav.order)) throw new LayoutError('nav.order must be an object');
      checkKeys(input.nav.order, PLACEMENTS, 'nav.order');
      nav.order = {};
      for (const placement of PLACEMENTS) {
        const list = input.nav.order[placement];
        if (list !== undefined) nav.order[placement] = asIdList(list, `nav.order.${placement}`);
      }
    }
    out.nav = nav;
  }

  if (input.tabs !== undefined) {
    out.tabs = {};
    for (const [page, raw] of asRecord(input.tabs, 'tabs')) {
      if (!isObject(raw)) throw new LayoutError(`tabs.${page} must be an object`);
      checkKeys(raw, ['hidden', 'order', 'default'], `tabs.${page}`);
      const tabs: { hidden?: string[]; order?: string[]; default?: string } = {};
      if (raw.hidden !== undefined) tabs.hidden = asIdList(raw.hidden, `tabs.${page}.hidden`);
      if (raw.order !== undefined) tabs.order = asIdList(raw.order, `tabs.${page}.order`);
      if (raw.default !== undefined) tabs.default = asId(raw.default, `tabs.${page}.default`);
      out.tabs[page] = tabs;
    }
  }

  if (input.widgets !== undefined) {
    out.widgets = {};
    for (const [area, raw] of asRecord(input.widgets, 'widgets')) {
      if (!isObject(raw)) throw new LayoutError(`widgets.${area} must be an object`);
      checkKeys(raw, ['hidden', 'order', 'width'], `widgets.${area}`);
      const widgets: { hidden?: string[]; order?: string[]; width?: Record<string, Width> } = {};
      if (raw.hidden !== undefined) widgets.hidden = asIdList(raw.hidden, `widgets.${area}.hidden`);
      if (raw.order !== undefined) widgets.order = asIdList(raw.order, `widgets.${area}.order`);
      if (raw.width !== undefined) {
        widgets.width = {};
        for (const [id, w] of asRecord(raw.width, `widgets.${area}.width`)) {
          if (!WIDTHS.includes(w as Width)) throw new LayoutError(`widgets.${area}.width.${id} is not valid`);
          widgets.width[id] = w as Width;
        }
      }
      out.widgets[area] = widgets;
    }
  }

  return out;
}

const now = () => new Date().toISOString();

// ── Own layout ───────────────────────────────────────────────────────────────

export async function getUserLayout(userId: number): Promise<StoredLayout | null> {
  await ready();
  const [row] = await db.select({ config: schema.userLayouts.config }).from(schema.userLayouts)
    .where(eq(schema.userLayouts.userId, userId));
  return row?.config ?? null;
}

export async function setUserLayout(userId: number, input: unknown): Promise<StoredLayout> {
  await ready();
  const config = validateLayout(input);
  await db.insert(schema.userLayouts)
    .values({ userId, config, updatedAt: now() })
    .onConflictDoUpdate({ target: schema.userLayouts.userId, set: { config, updatedAt: now() } });
  return config;
}

export async function clearUserLayout(userId: number): Promise<void> {
  await ready();
  await db.delete(schema.userLayouts).where(eq(schema.userLayouts.userId, userId));
}

// ── Role layouts ─────────────────────────────────────────────────────────────

async function requireRole(roleId: number) {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId));
  if (!role) throw new LayoutError(`No role with id ${roleId}`);
  return role;
}

export async function setRoleLayout(editorId: number, roleId: number, input: unknown): Promise<StoredLayout> {
  await ready();
  await requireRole(roleId);
  const config = validateLayout(input);
  await db.insert(schema.roleLayouts)
    .values({ roleId, config, updatedAt: now(), updatedByUserId: editorId })
    .onConflictDoUpdate({ target: schema.roleLayouts.roleId, set: { config, updatedAt: now(), updatedByUserId: editorId } });
  return config;
}

export async function clearRoleLayout(roleId: number): Promise<void> {
  await ready();
  await requireRole(roleId);
  await db.delete(schema.roleLayouts).where(eq(schema.roleLayouts.roleId, roleId));
}

// ── Permission layouts ───────────────────────────────────────────────────────

async function requirePermissionRow(resource: string, action: string) {
  const [row] = await db.select().from(schema.permissions)
    .where(and(eq(schema.permissions.resource, resource), eq(schema.permissions.action, action)));
  if (!row) throw new LayoutError(`${resource}:${action} is not in the permission catalog`);
  return row;
}

export async function setPermissionLayout(
  editorId: number, resource: string, action: string, priority: unknown, input: unknown,
): Promise<StoredLayout> {
  await ready();
  const permission = await requirePermissionRow(resource, action);
  if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0) {
    throw new LayoutError('priority must be an integer, 0 or greater (lower wins)');
  }
  const config = validateLayout(input);
  await db.insert(schema.permissionLayouts)
    .values({ permissionId: permission.id, priority, config, updatedAt: now(), updatedByUserId: editorId })
    .onConflictDoUpdate({
      target: schema.permissionLayouts.permissionId,
      set: { priority, config, updatedAt: now(), updatedByUserId: editorId },
    });
  return config;
}

export async function clearPermissionLayout(resource: string, action: string): Promise<void> {
  await ready();
  const permission = await requirePermissionRow(resource, action);
  await db.delete(schema.permissionLayouts).where(eq(schema.permissionLayouts.permissionId, permission.id));
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every stored permission and role layout, for the admin editor. */
export async function listLayouts() {
  await ready();
  const [permissionRows, roleRows] = await Promise.all([
    db.select({
      resource: schema.permissions.resource,
      action: schema.permissions.action,
      priority: schema.permissionLayouts.priority,
      config: schema.permissionLayouts.config,
      updatedAt: schema.permissionLayouts.updatedAt,
    })
      .from(schema.permissionLayouts)
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.permissionLayouts.permissionId))
      .orderBy(asc(schema.permissionLayouts.priority), asc(schema.permissionLayouts.permissionId)),
    db.select({
      roleId: schema.roleLayouts.roleId,
      roleName: schema.roles.name,
      rank: schema.roles.rank,
      config: schema.roleLayouts.config,
      updatedAt: schema.roleLayouts.updatedAt,
    })
      .from(schema.roleLayouts)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.roleLayouts.roleId))
      .orderBy(asc(schema.roles.rank)),
  ]);
  return { permissions: permissionRows, roles: roleRows };
}

export interface LayoutLayers {
  permission: { key: string; priority: number; config: StoredLayout }[];
  roles: { roleId: number; rank: number; config: StoredLayout }[];
  user: StoredLayout | null;
}

/** The layers that apply to one user, each list already in application order:
 *  the layer that should lose comes first, the one that should win comes last
 *  (so the client just applies them in sequence). Permission layers are only
 *  those the user effectively holds; role layers are the user's own roles. */
export async function getLayoutLayers(userId: number): Promise<LayoutLayers> {
  await ready();
  const held = new Set((await getEffectivePermissions(userId)).map((p) => `${p.resource}:${p.action}`));

  const permissionRows = await db.select({
    resource: schema.permissions.resource,
    action: schema.permissions.action,
    permissionId: schema.permissionLayouts.permissionId,
    priority: schema.permissionLayouts.priority,
    config: schema.permissionLayouts.config,
  })
    .from(schema.permissionLayouts)
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.permissionLayouts.permissionId))
    .orderBy(desc(schema.permissionLayouts.priority), desc(schema.permissionLayouts.permissionId));

  const roleRows = await db.select({
    roleId: schema.roles.id,
    rank: schema.roles.rank,
    config: schema.roleLayouts.config,
  })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .innerJoin(schema.roleLayouts, eq(schema.roleLayouts.roleId, schema.roles.id))
    .where(eq(schema.userRoles.userId, userId))
    .orderBy(desc(schema.roles.rank));

  return {
    permission: permissionRows
      .filter((r) => held.has(`${r.resource}:${r.action}`))
      .map((r) => ({ key: `${r.resource}:${r.action}`, priority: r.priority, config: r.config })),
    roles: roleRows,
    user: await getUserLayout(userId),
  };
}
