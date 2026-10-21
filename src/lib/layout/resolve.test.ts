import { describe, expect, it } from 'vitest';
import { applyOrder, firstAccessibleRoute, flattenLayers, gateAllows, resolveNav } from './resolve';
import type { CanFn, LayoutConfig, NavItemBase } from './types';

const item = (id: string, over: Partial<NavItemBase> = {}): NavItemBase => ({
  id, label: id, to: `/${id}`, group: 'G', defaultPlacement: 'sidebar', ...over,
});

const grants = (...keys: string[]): CanFn => (resource, action) => keys.includes(`${resource}:${action}`);
const allow: CanFn = () => true;
const ids = (list: NavItemBase[]) => list.map((i) => i.id);

describe('gateAllows', () => {
  const gate = { requires: [{ resource: 'A', action: 'read' as const }, { resource: 'B', action: 'read' as const }] };

  it('is open with no gate or no requirements', () => {
    expect(gateAllows(undefined, () => false)).toBe(true);
    expect(gateAllows({ requires: [] }, () => false)).toBe(true);
  });
  it('requires every permission by default', () => {
    expect(gateAllows(gate, grants('A:read'))).toBe(false);
    expect(gateAllows(gate, grants('A:read', 'B:read'))).toBe(true);
  });
  it('accepts any one permission in any mode', () => {
    expect(gateAllows({ ...gate, mode: 'any' }, grants('B:read'))).toBe(true);
    expect(gateAllows({ ...gate, mode: 'any' }, grants())).toBe(false);
  });
});

describe('applyOrder', () => {
  it('puts named ids first and keeps the rest in order', () => {
    expect(applyOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'a', 'b', 'd']);
  });
  it('ignores unknown and repeated ids', () => {
    expect(applyOrder(['a', 'b'], ['zzz', 'b', 'b'])).toEqual(['b', 'a']);
  });
  it('leaves the list alone with nothing named', () => {
    expect(applyOrder(['a', 'b'], undefined)).toEqual(['a', 'b']);
    expect(applyOrder(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('resolveNav', () => {
  const items = [
    item('home', { group: null }),
    item('a'),
    item('b'),
    item('c', { group: 'H' }),
    item('hr', { group: 'Mod', defaultPlacement: 'header', gate: { requires: [{ resource: 'Employee', action: 'read' }] } }),
    item('me', { group: 'S', defaultPlacement: 'userMenu', needsEmployee: true }),
    item('open', { group: 'S', defaultPlacement: 'userMenu' }),
  ];

  it('splits by default placement and groups sidebar sections in registry order', () => {
    const nav = resolveNav({ items, can: allow, hasEmployee: true });
    expect(nav.sidebar.map((s) => s.group)).toEqual([null, 'G', 'H']);
    expect(ids(nav.sidebar[1].items)).toEqual(['a', 'b']);
    expect(ids(nav.header)).toEqual(['hr']);
    expect(ids(nav.userMenu)).toEqual(['me', 'open']);
  });

  it('drops items the user cannot access and sections left empty', () => {
    const nav = resolveNav({ items, can: grants(), hasEmployee: false });
    expect(ids(nav.header)).toEqual([]);
    expect(ids(nav.userMenu)).toEqual(['open']);
  });

  it('applies hidden, placement and order from a layer', () => {
    const layer: LayoutConfig = {
      v: 1,
      nav: {
        items: { a: { hidden: true }, hr: { placement: 'sidebar' } },
        order: { sidebar: ['hr', 'c'] },
      },
    };
    const nav = resolveNav({ items, can: allow, hasEmployee: true, layers: [layer] });
    expect(ids(nav.sidebar.flatMap((s) => s.items))).toEqual(['home', 'b', 'c', 'hr']);
    expect(nav.sidebar.map((s) => s.group)).toEqual([null, 'G', 'H', 'Mod']);
    expect(nav.header).toEqual([]);
  });

  it('lets a later layer override an earlier one', () => {
    const role: LayoutConfig = { v: 1, nav: { items: { a: { hidden: true } }, order: { sidebar: ['b', 'a'] } } };
    const user: LayoutConfig = { v: 1, nav: { items: { a: { hidden: false } } } };
    const nav = resolveNav({ items, can: allow, hasEmployee: true, layers: [role, user] });
    expect(ids(nav.sidebar[1].items)).toEqual(['b', 'a']);
  });

  it('never lets a layer bring back an item the user cannot access', () => {
    const layer: LayoutConfig = { v: 1, nav: { items: { hr: { hidden: false, placement: 'sidebar' } }, order: { sidebar: ['hr'] } } };
    const nav = resolveNav({ items, can: grants(), hasEmployee: true, layers: [layer] });
    expect(ids(nav.sidebar.flatMap((s) => s.items))).not.toContain('hr');
    expect(ids(nav.header)).toEqual([]);
  });

  it('ignores unknown ids and invalid placements', () => {
    const layer = {
      v: 1,
      nav: { items: { ghost: { hidden: true }, a: { placement: 'nowhere' } }, order: { sidebar: ['ghost', 'b'] } },
    } as unknown as LayoutConfig;
    const nav = resolveNav({ items, can: allow, hasEmployee: true, layers: [layer] });
    expect(ids(nav.sidebar[1].items)).toEqual(['b', 'a']);
  });

  it('skips null layers', () => {
    const nav = resolveNav({ items, can: allow, hasEmployee: true, layers: [null, undefined] });
    expect(ids(nav.header)).toEqual(['hr']);
  });
});

describe('flattenLayers', () => {
  const cfg = (id: string): LayoutConfig => ({ v: 1, nav: { items: { [id]: { hidden: true } } } });

  it('applies permission layers, then roles, then the user', () => {
    const layers = flattenLayers({
      permission: [{ key: 'A:read', priority: 9, config: cfg('p1') }, { key: 'B:read', priority: 1, config: cfg('p2') }],
      roles: [{ roleId: 1, rank: 50, config: cfg('r1') }],
      user: cfg('u'),
    });
    expect(layers.map((l) => Object.keys(l.nav!.items!)[0])).toEqual(['p1', 'p2', 'r1', 'u']);
  });

  it('copes with a missing layout or user layer', () => {
    expect(flattenLayers(undefined)).toEqual([]);
    expect(flattenLayers({ permission: [], roles: [], user: null })).toEqual([]);
  });
});

describe('firstAccessibleRoute', () => {
  const items = [
    item('a', { group: 'G', gate: { requires: [{ resource: 'A', action: 'read' }] } }),
    item('b', { group: 'G', gate: { requires: [{ resource: 'B', action: 'read' }] } }),
    item('hr', { group: 'M', defaultPlacement: 'header', gate: { requires: [{ resource: 'HR', action: 'read' }] } }),
    item('menu', { group: 'S', defaultPlacement: 'userMenu' }),
  ];

  it('prefers the first sidebar page the user can see', () => {
    const nav = resolveNav({ items, can: grants('B:read', 'HR:read'), hasEmployee: false });
    expect(firstAccessibleRoute(nav)).toBe('/b');
  });

  it('falls back to the header when the sidebar is empty', () => {
    const nav = resolveNav({ items, can: grants('HR:read'), hasEmployee: false });
    expect(firstAccessibleRoute(nav)).toBe('/hr');
  });

  it('ignores the user menu, so no real access means no landing page', () => {
    const nav = resolveNav({ items, can: grants(), hasEmployee: false });
    expect(nav.userMenu).toHaveLength(1);
    expect(firstAccessibleRoute(nav)).toBeNull();
  });

  it('follows the user\'s own order and hidden items', () => {
    const layer: LayoutConfig = { v: 1, nav: { items: { a: { hidden: true } } } };
    const nav = resolveNav({ items, can: grants('A:read', 'B:read'), hasEmployee: false, layers: [layer] });
    expect(firstAccessibleRoute(nav)).toBe('/b');
  });
});
