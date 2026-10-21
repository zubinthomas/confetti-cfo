// Pure layout resolution. No React, no icons, so it can be unit-tested.
import {
  PLACEMENTS,
  type CanFn, type Gate, type LayoutConfig, type NavItemBase, type Placement,
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

export interface ResolvedNav<T extends NavItemBase> {
  sidebar: { group: string | null; items: T[] }[];
  header: T[];
  userMenu: T[];
}

interface ResolveNavOptions<T extends NavItemBase> {
  items: T[];
  can: CanFn;
  hasEmployee: boolean;
  /** Lowest priority first: permission layers, then role layers, then the user. */
  layers?: (LayoutConfig | null | undefined)[];
}

export function resolveNav<T extends NavItemBase>(
  { items, can, hasEmployee, layers = [] }: ResolveNavOptions<T>,
): ResolvedNav<T> {
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
