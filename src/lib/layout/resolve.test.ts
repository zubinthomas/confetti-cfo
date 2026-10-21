import { describe, expect, it } from 'vitest';
import { applyOrder, firstAccessibleRoute, flattenLayers, gateAllows, resolveNav, resolveTabs, resolveWidgets } from './resolve';
import type { CanFn, LayoutConfig, NavItemBase, TabBase, WidgetBase } from './types';

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

describe('resolveTabs', () => {
  const tab = (id: string, resource?: string): TabBase => ({
    id, label: id, gate: resource ? { requires: [{ resource, action: 'read' as const }] } : undefined,
  });
  const tabs = [tab('a', 'A'), tab('b', 'B'), tab('c'), tab('d', 'D')];
  const tabLayer = (cfg: NonNullable<LayoutConfig['tabs']>[string], page = 'p'): LayoutConfig => ({ v: 1, tabs: { [page]: cfg } });
  const run = (can: CanFn, layers?: LayoutConfig[]) => resolveTabs({ pageId: 'p', tabs, can, layers });

  it('keeps registry order and drops tabs the user cannot access', () => {
    const r = run(grants('A:read', 'D:read'));
    expect(r.tabs.map((t) => t.id)).toEqual(['a', 'c', 'd']);
    expect(r.defaultId).toBe('a');
  });

  it('opens on the first tab the user can access, not the first tab', () => {
    expect(run(grants('D:read')).defaultId).toBe('c');
    expect(run(grants()).defaultId).toBe('c');
  });

  it('reports no default when nothing is accessible', () => {
    const only = resolveTabs({ pageId: 'p', tabs: [tab('a', 'A')], can: grants() });
    expect(only).toEqual({ tabs: [], defaultId: null });
  });

  it('applies order, hidden and default from a layer', () => {
    const r = run(allow, [tabLayer({ order: ['d', 'c'], hidden: ['a'], default: 'c' })]);
    expect(r.tabs.map((t) => t.id)).toEqual(['d', 'c', 'b']);
    expect(r.defaultId).toBe('c');
  });

  it('adds hidden lists across layers and lets a later layer re-show', () => {
    const role = tabLayer({ hidden: ['a', 'b'] });
    expect(run(allow, [role, tabLayer({ hidden: ['c'] })]).tabs.map((t) => t.id)).toEqual(['d']);
    expect(run(allow, [role, tabLayer({ shown: ['b'] })]).tabs.map((t) => t.id)).toEqual(['b', 'c', 'd']);
  });

  it('lets a lower layer hide again what a higher one never mentioned', () => {
    const user = tabLayer({ shown: ['a'] });
    const later = tabLayer({ hidden: ['a'] });
    expect(run(allow, [user, later]).tabs.map((t) => t.id)).toEqual(['b', 'c', 'd']);
  });

  it('ignores a default that is hidden or inaccessible', () => {
    expect(run(grants(), [tabLayer({ default: 'a' })]).defaultId).toBe('c');
    expect(run(allow, [tabLayer({ hidden: ['b'], default: 'b' })]).defaultId).toBe('a');
  });

  it('never hides every tab', () => {
    const r = run(grants(), [tabLayer({ hidden: ['c'] })]);
    expect(r.tabs.map((t) => t.id)).toEqual(['c']);
  });

  it('only reads the layer config for its own page', () => {
    const r = run(allow, [tabLayer({ hidden: ['a'] }, 'other')]);
    expect(r.tabs.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('cannot bring back an inaccessible tab through order or default', () => {
    const r = run(grants(), [tabLayer({ order: ['a', 'b', 'd'], default: 'd' })]);
    expect(r.tabs.map((t) => t.id)).toEqual(['c']);
  });
});

describe('resolveWidgets', () => {
  const widget = (id: string, over: Partial<WidgetBase> = {}): WidgetBase => ({
    id, label: id, defaultWidth: 'third', ...over,
  });
  const widgets = [
    widget('a'),
    widget('b', { defaultWidth: 'full' }),
    widget('c', { gate: { requires: [{ resource: 'C', action: 'read' }] } }),
    widget('d', { defaultHidden: true }),
  ];
  const layer = (cfg: NonNullable<LayoutConfig['widgets']>[string], area = 'o'): LayoutConfig => ({ v: 1, widgets: { [area]: cfg } });
  const run = (can: CanFn, layers?: LayoutConfig[]) =>
    resolveWidgets({ areaId: 'o', widgets, can, layers }).map((r) => `${r.widget.id}:${r.width}`);

  it('uses registry order and widths, skipping default-hidden and inaccessible widgets', () => {
    expect(run(grants())).toEqual(['a:third', 'b:full']);
    expect(run(allow)).toEqual(['a:third', 'b:full', 'c:third']);
  });

  it('shows a default-hidden widget when a layer lists it as shown', () => {
    expect(run(allow, [layer({ shown: ['d'] })])).toEqual(['a:third', 'b:full', 'c:third', 'd:third']);
  });

  it('keeps a lower layer\'s shown widgets when a higher layer only hides another', () => {
    const role = layer({ shown: ['d'] });
    const user = layer({ hidden: ['a'] });
    expect(run(allow, [role, user])).toEqual(['b:full', 'c:third', 'd:third']);
  });

  it('applies order and per-widget width, the highest layer winning', () => {
    const role = layer({ order: ['b', 'a'], width: { a: 'half', b: 'half' } });
    const user = layer({ width: { a: 'sixth' } });
    expect(run(allow, [role, user])).toEqual(['b:half', 'a:sixth', 'c:third']);
  });

  it('cannot bring back an inaccessible widget, and may hide every widget', () => {
    expect(run(grants(), [layer({ shown: ['c'], order: ['c'] })])).toEqual(['a:third', 'b:full']);
    expect(run(grants(), [layer({ hidden: ['a', 'b'] })])).toEqual([]);
  });

  it('ignores unknown widths and other areas', () => {
    expect(run(allow, [layer({ width: { a: 'huge' as never } })])[0]).toBe('a:third');
    expect(run(allow, [layer({ hidden: ['a'] }, 'other')])[0]).toBe('a:third');
  });
});
