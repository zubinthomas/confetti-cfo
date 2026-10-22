// Pure layout resolution. No React, no icons, so it can be unit-tested.
import {
  PLACEMENTS, WIDTHS,
  type CanFn, type Gate, type LayoutConfig, type LayoutLayers, type NavItemBase, type Placement, type TabBase,
  type WidgetBase, type WidgetWidth,
} from './types';

/** Same rule as RequirePermission: a gate with no requirements is open. */
export function gateAllows(gate: Gate | undefined, can: CanFn): boolean {
  if (!gate || gate.requires.length === 0) return true;
  const checks = gate.requires.map(({ resource, action }) => can(resource, action));
  return gate.mode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
}

/** Puts the ids a layer names first, in the layer's order, then everything it
 *  doesn't name in its existing order. Names not in `current` are dropped. */
export function applyOrder(current: string[], named: string[] | undefined): string[] {
  if (!named || named.length === 0) return current;
  const available = new Set(current);
  const head: string[] = [];
  const taken = new Set<string>();
  for (const id of named) {
    if (available.has(id) && !taken.has(id)) {
      head.push(id);
      taken.add(id);
    }
  }
  return [...head, ...current.filter((id) => !taken.has(id))];
}

/** The layers in the order they are applied: permission layers, then role
 *  layers, then the user's own. The server already ordered each list so the
 *  winning layer comes last. */
export function flattenLayers(layout: LayoutLayers | null | undefined): LayoutConfig[] {
  if (!layout) return [];
  return [
    ...layout.permission.map((l) => l.config),
    ...layout.roles.map((l) => l.config),
    ...(layout.user ? [layout.user] : []),
  ];
}

export interface ResolvedNav<T extends NavItemBase> {
  sidebar: { group: string | null; items: T[] }[];
  header: T[];
  userMenu: T[];
}

/** Where a user who can't open the Overview should land: the first page they
 *  can see in their own sidebar, then in their header. The user menu is left
 *  out on purpose (settings pages aren't a home page), so someone with no real
 *  access gets null and keeps the access-restricted screen. */
export function firstAccessibleRoute<T extends NavItemBase>(nav: ResolvedNav<T>): string | null {
  const first = nav.sidebar.flatMap((section) => section.items)[0] ?? nav.header[0];
  return first?.to ?? null;
}

/** How many places the person can go from the sidebar and the top bar together.
 *  The user menu is left out: it holds account pages, not somewhere to browse. */
export function navDestinationCount<T extends NavItemBase>(nav: ResolvedNav<T>): number {
  return nav.sidebar.reduce((n, section) => n + section.items.length, 0) + nav.header.length;
}

/** The one page a person has when the nav is down to a single destination, or
 *  null when there are none or several. The shell offers a way back to it from
 *  account pages, since there is no menu to do that. */
export function soleDestination<T extends NavItemBase>(nav: ResolvedNav<T>): T | null {
  if (navDestinationCount(nav) !== 1) return null;
  return nav.sidebar.flatMap((section) => section.items)[0] ?? nav.header[0] ?? null;
}

/** Whether the current path is that destination or somewhere under it. */
export function isAtDestination(item: Pick<NavItemBase, 'to' | 'end'>, pathname: string): boolean {
  if (pathname === item.to) return true;
  if (item.end) return false;
  return pathname.startsWith(item.to.endsWith('/') ? item.to : `${item.to}/`);
}

interface ResolveNavOptions<T extends NavItemBase> {
  items: T[];
  can: CanFn;
  hasEmployee: boolean;
  /** Lowest priority first: permission layers, then role layers, then the user. */
  layers?: (LayoutConfig | null | undefined)[];
}

/** Everything the layers decided about navigation, hidden items included.
 *  The editor works on this; resolveNav only returns what is visible. */
export interface NavState<T extends NavItemBase> {
  byId: Map<string, T>;
  lists: Record<Placement, string[]>;
  hidden: Set<string>;
}

export function resolveNavState<T extends NavItemBase>(
  { items, can, hasEmployee, layers = [] }: ResolveNavOptions<T>,
): NavState<T> {
  // Access is the hard filter: an item the user can't open never enters the
  // working lists, so no layer can bring it back.
  const byId = new Map<string, T>();
  for (const item of items) {
    if (item.needsEmployee && !hasEmployee) continue;
    if (!gateAllows(item.gate, can)) continue;
    byId.set(item.id, item);
  }

  const lists: Record<Placement, string[]> = { sidebar: [], header: [], userMenu: [] };
  const placementOf = new Map<string, Placement>();
  const hidden = new Set<string>();
  for (const item of byId.values()) {
    placementOf.set(item.id, item.defaultPlacement);
    lists[item.defaultPlacement].push(item.id);
  }

  for (const layer of layers) {
    const nav = layer?.nav;
    if (!nav) continue;
    for (const [id, override] of Object.entries(nav.items ?? {})) {
      const current = placementOf.get(id);
      if (!current) continue;
      const next = override.placement;
      if (next && PLACEMENTS.includes(next) && next !== current) {
        lists[current] = lists[current].filter((x) => x !== id);
        lists[next].push(id);
        placementOf.set(id, next);
      }
      if (override.hidden === true) hidden.add(id);
      else if (override.hidden === false) hidden.delete(id);
    }
    for (const placement of PLACEMENTS) {
      lists[placement] = applyOrder(lists[placement], nav.order?.[placement]);
    }
  }

  return { byId, lists, hidden };
}

export function resolveNav<T extends NavItemBase>(options: ResolveNavOptions<T>): ResolvedNav<T> {
  const { items } = options;
  const { byId, lists, hidden } = resolveNavState(options);

  const shown = (placement: Placement) =>
    lists[placement].filter((id) => !hidden.has(id)).map((id) => byId.get(id)!);

  // Sections keep registry order (first appearance); items within a section
  // follow the resolved sidebar order.
  const groupOrder: (string | null)[] = [];
  for (const item of items) {
    if (!groupOrder.includes(item.group)) groupOrder.push(item.group);
  }
  const sidebarItems = shown('sidebar');
  const sidebar = groupOrder
    .map((group) => ({ group, items: sidebarItems.filter((i) => i.group === group) }))
    .filter((section) => section.items.length > 0);

  return { sidebar, header: shown('header'), userMenu: shown('userMenu') };
}

export interface ResolvedTabs<T extends TabBase> {
  tabs: T[];
  /** The tab to open first: the highest layer's choice if it is visible,
   *  otherwise the first visible tab. null only when nothing is accessible. */
  defaultId: string | null;
}

/** Folds one layer's `hidden` and `shown` lists into the running hidden set.
 *  Additive on purpose: a layer only says what it changes, so a user who hides
 *  one widget does not un-hide everything a role hid. `shown` is applied last,
 *  so it wins inside a layer, and later layers win across layers. */
function applyVisibility(hidden: Set<string>, config: { hidden?: string[]; shown?: string[] }): void {
  for (const id of config.hidden ?? []) hidden.add(id);
  for (const id of config.shown ?? []) hidden.delete(id);
}

/** Tabs for one page. Access (the gate) is the hard filter. Then each layer
 *  in turn can reorder (same rule as applyOrder), hide or re-show tabs
 *  (additive, see applyVisibility) and pick a default tab. If hiding would
 *  leave the page with no tabs the hidden list is ignored. */
export interface TabsState<T extends TabBase> {
  byId: Map<string, T>;
  order: string[];
  hidden: Set<string>;
  /** The highest layer's choice, if any layer made one. */
  preferred: string | undefined;
}

export function resolveTabsState<T extends TabBase>(
  { pageId, tabs, can, layers = [] }: {
    pageId: string;
    tabs: T[];
    can: CanFn;
    layers?: (LayoutConfig | null | undefined)[];
  },
): TabsState<T> {
  const accessible = tabs.filter((tab) => gateAllows(tab.gate, can));
  const byId = new Map(accessible.map((tab) => [tab.id, tab]));

  let order = accessible.map((tab) => tab.id);
  const hidden = new Set<string>();
  let preferred: string | undefined;
  for (const layer of layers) {
    const config = layer?.tabs?.[pageId];
    if (!config) continue;
    applyVisibility(hidden, config);
    order = applyOrder(order, config.order);
    if (config.default !== undefined) preferred = config.default;
  }
  return { byId, order, hidden, preferred };
}

export function resolveTabs<T extends TabBase>(
  options: { pageId: string; tabs: T[]; can: CanFn; layers?: (LayoutConfig | null | undefined)[] },
): ResolvedTabs<T> {
  const { byId, order, hidden, preferred } = resolveTabsState(options);
  let shownIds = order.filter((id) => !hidden.has(id));
  if (shownIds.length === 0) shownIds = order;
  const shown = shownIds.map((id) => byId.get(id)!);
  const defaultId = preferred && shownIds.includes(preferred) ? preferred : shown[0]?.id ?? null;
  return { tabs: shown, defaultId };
}

export interface ResolvedWidget<T extends WidgetBase> {
  widget: T;
  width: WidgetWidth;
}

/** What the layers decided about one widget area, hidden widgets included
 *  (section headers are not part of it, they are placed by resolveWidgets). */
export interface WidgetsState<T extends WidgetBase> {
  byId: Map<string, T>;
  headers: T[];
  order: string[];
  hidden: Set<string>;
  widths: Map<string, WidgetWidth>;
}

export function resolveWidgetsState<T extends WidgetBase>(
  { areaId, widgets, can, layers = [] }: {
    areaId: string;
    widgets: T[];
    can: CanFn;
    layers?: (LayoutConfig | null | undefined)[];
  },
): WidgetsState<T> {
  const allowed = widgets.filter((w) => gateAllows(w.gate, can));
  const headers = allowed.filter((w) => w.sectionHeader);
  const accessible = allowed.filter((w) => !w.sectionHeader);
  const byId = new Map(accessible.map((w) => [w.id, w]));

  let order = accessible.map((w) => w.id);
  const hidden = new Set(accessible.filter((w) => w.defaultHidden).map((w) => w.id));
  const widths = new Map<string, WidgetWidth>(accessible.map((w) => [w.id, w.defaultWidth]));
  for (const layer of layers) {
    const config = layer?.widgets?.[areaId];
    if (!config) continue;
    applyVisibility(hidden, config);
    order = applyOrder(order, config.order);
    for (const [id, width] of Object.entries(config.width ?? {})) {
      if (byId.has(id) && WIDTHS.includes(width)) widths.set(id, width);
    }
  }
  return { byId, headers, order, hidden, widths };
}

/** Widgets for one area. Access (the gate) is the hard filter. The registry's
 *  defaultHidden widgets start hidden; each layer can reorder, hide or re-show
 *  (additive) and set per-widget widths. Unlike tabs, hiding everything is
 *  allowed: an empty overview is a valid choice. Section headers are outside
 *  all of that: layers can't touch them, they are placed afterwards. */
export function resolveWidgets<T extends WidgetBase>(
  options: { areaId: string; widgets: T[]; can: CanFn; layers?: (LayoutConfig | null | undefined)[] },
): ResolvedWidget<T>[] {
  const { byId, headers, order, hidden, widths } = resolveWidgetsState(options);

  const resolved = order
    .filter((id) => !hidden.has(id))
    .map((id) => ({ widget: byId.get(id)!, width: widths.get(id) ?? byId.get(id)!.defaultWidth }));

  for (const header of headers) {
    const at = resolved.findIndex((r) => r.widget.section !== undefined && r.widget.section === header.section);
    if (at >= 0) resolved.splice(at, 0, { widget: header, width: header.defaultWidth });
  }
  return resolved;
}
