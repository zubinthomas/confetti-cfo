import { describe, expect, it } from 'vitest';
import {
  diffState, isEmptyLayout, navItemSource, stateFromLayers, tabSource, widgetSource,
  type EditorContext, type EditorState,
} from './editor';
import type { CanFn, LayoutConfig, NavItemBase, TabBase, WidgetBase } from './types';

const nav = (id: string, over: Partial<NavItemBase> = {}): NavItemBase => ({
  id, label: id, to: `/${id}`, group: 'G', defaultPlacement: 'sidebar', ...over,
});
const gate = (resource: string) => ({ requires: [{ resource, action: 'read' as const }] });

const ctx = (can: CanFn = () => true): EditorContext => ({
  navItems: [nav('a'), nav('b'), nav('c'), nav('h', { defaultPlacement: 'header' }), nav('x', { gate: gate('X') })],
  tabs: { p: [{ id: 't1', label: 't1' }, { id: 't2', label: 't2' }, { id: 't3', label: 't3' }] satisfies TabBase[] },
  widgets: [
    { id: 'w1', label: 'w1', defaultWidth: 'third' },
    { id: 'w2', label: 'w2', defaultWidth: 'full' },
    { id: 'w3', label: 'w3', defaultWidth: 'half', defaultHidden: true },
  ] satisfies WidgetBase[],
  areaId: 'o',
  can,
  hasEmployee: true,
});

const role: LayoutConfig = {
  v: 1,
  nav: { items: { b: { hidden: true } } },
  tabs: { p: { hidden: ['t3'], default: 't2' } },
  widgets: { o: { shown: ['w3'], width: { w1: 'half' } } },
};

const clone = (s: EditorState): EditorState => JSON.parse(JSON.stringify(s));
const roundTrip = (c: EditorContext, below: LayoutConfig[], edit: (s: EditorState) => void) => {
  const base = stateFromLayers(c, below);
  const desired = clone(base);
  edit(desired);
  const diff = diffState(c, base, desired);
  return { base, desired, diff, applied: stateFromLayers(c, [...below, diff]) };
};
const norm = (s: EditorState) => ({
  ...s,
  nav: { ...s.nav, hidden: [...s.nav.hidden].sort() },
  tabs: Object.fromEntries(Object.entries(s.tabs).map(([k, v]) => [k, { ...v, hidden: [...v.hidden].sort() }])),
  widgets: { ...s.widgets, hidden: [...s.widgets.hidden].sort() },
});

describe('stateFromLayers', () => {
  it('reflects the layers, hidden items included, and leaves out what the viewer cannot access', () => {
    const s = stateFromLayers(ctx(), [role]);
    expect(s.nav.lists.sidebar).toEqual(['a', 'b', 'c', 'x']);
    expect(s.nav.hidden).toEqual(['b']);
    expect(s.tabs.p).toEqual({ order: ['t1', 't2', 't3'], hidden: ['t3'], default: 't2' });
    expect(s.widgets.hidden).toEqual([]);
    expect(s.widgets.widths).toEqual({ w1: 'half', w2: 'full', w3: 'half' });
    expect(stateFromLayers(ctx((r) => r !== 'X'), []).nav.lists.sidebar).toEqual(['a', 'b', 'c']);
  });
});

describe('diffState', () => {
  it('is empty when nothing changed', () => {
    const base = stateFromLayers(ctx(), [role]);
    expect(isEmptyLayout(diffState(ctx(), base, clone(base)))).toBe(true);
  });

  it('records only what differs from the layers below', () => {
    const { diff } = roundTrip(ctx(), [role], (s) => {
      s.nav.hidden = [];
      s.widgets.widths.w2 = 'sixth';
    });
    expect(diff).toEqual({ v: 1, nav: { items: { b: { hidden: false } } }, widgets: { o: { width: { w2: 'sixth' } } } });
  });

  it('applying the diff on top of the lower layers gives back the edited state', () => {
    const c = ctx();
    const { desired, applied } = roundTrip(c, [role], (s) => {
      s.nav.lists.sidebar = ['c', 'a', 'x'];
      s.nav.lists.header = ['h', 'b'];
      s.nav.hidden = ['a'];
      s.tabs.p = { order: ['t3', 't1', 't2'], hidden: ['t1'], default: 't3' };
      s.widgets.order = ['w3', 'w2', 'w1'];
      s.widgets.hidden = ['w2'];
      s.widgets.widths.w1 = 'sixth';
    });
    expect(norm(applied)).toEqual(norm(desired));
  });

  it('uses shown to bring back what a lower layer hid, and hidden for what it did not', () => {
    const { diff } = roundTrip(ctx(), [role], (s) => {
      s.tabs.p.hidden = ['t1'];
      s.widgets.hidden = ['w1'];
    });
    expect(diff.tabs?.p).toEqual({ hidden: ['t1'], shown: ['t3'] });
    expect(diff.widgets?.o).toEqual({ hidden: ['w1'] });
  });

  it('records a placement move and the new order of both lists', () => {
    const { diff } = roundTrip(ctx(), [], (s) => {
      s.nav.lists.sidebar = s.nav.lists.sidebar.filter((id) => id !== 'c');
      s.nav.lists.header = [...s.nav.lists.header, 'c'];
    });
    expect(diff.nav?.items).toEqual({ c: { placement: 'header' } });
    expect(diff.nav?.order?.header).toEqual(['h', 'c']);
    expect(diff.nav?.order?.sidebar).toEqual(['a', 'b', 'x']);
  });

  it('does not save a default tab that the same edit hides', () => {
    const { diff } = roundTrip(ctx(), [], (s) => {
      s.tabs.p.default = 't2';
      s.tabs.p.hidden = ['t2'];
    });
    expect(diff.tabs?.p).toEqual({ hidden: ['t2'] });
  });

  it('does not carry hidden ids the viewer cannot access into the editable state', () => {
    const preset: LayoutConfig = { v: 1, nav: { items: { x: { hidden: true } } }, widgets: { o: { hidden: ['ghost', 'w1'] } } };
    const noX = ctx((r) => r !== 'X');
    const s = stateFromLayers(noX, [preset]);
    expect(s.nav.hidden).toEqual([]);
    expect(s.widgets.hidden.sort()).toEqual(['w1', 'w3']);
    expect(diffState(noX, stateFromLayers(noX, []), s).widgets?.o).toEqual({ hidden: ['w1'] });
  });

  it('a stale diff for an id the viewer lost access to is ignored by the resolver', () => {
    const stale: LayoutConfig = { v: 1, nav: { items: { x: { hidden: true } }, order: { sidebar: ['x', 'a'] } } };
    const s = stateFromLayers(ctx((r) => r !== 'X'), [stale]);
    expect(s.nav.lists.sidebar).toEqual(['a', 'b', 'c']);
    expect(s.nav.hidden).toEqual([]);
  });
});

describe('where a setting came from', () => {
  const layers = [
    { label: 'Reservation:read', config: { v: 1, nav: { items: { a: { hidden: true } } } } as LayoutConfig },
    { label: 'Leadership role', config: role },
    { label: 'You', config: { v: 1, tabs: { p: { order: ['t2', 't1', 't3'] } }, widgets: { o: { hidden: ['w1'] } } } as LayoutConfig },
  ];

  it('names the highest layer that mentions the item', () => {
    expect(navItemSource(layers, 'a')).toBe('Reservation:read');
    expect(navItemSource(layers, 'b')).toBe('Leadership role');
    expect(navItemSource(layers, 'c')).toBeNull();
    expect(tabSource(layers, 'p', 't1')).toBe('You');
    expect(tabSource(layers, 'p', 't3')).toBe('You');
    expect(widgetSource(layers, 'o', 'w1')).toBe('You');
    expect(widgetSource(layers, 'o', 'w3')).toBe('Leadership role');
    expect(widgetSource(layers, 'o', 'w2')).toBeNull();
  });
});
