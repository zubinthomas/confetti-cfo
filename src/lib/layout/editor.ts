// Pure logic behind the layout editor, no React. The editor works on a full,
// editable picture (EditorState) of what one layer stack resolves to, and
// turns the result back into a sparse layer by diffing it against what the
// layers below would give. Saving only the differences keeps a layout from
// freezing things the user never touched: a role's later change still flows
// through to everyone whose own layout doesn't mention it.
import type {
  CanFn, LayoutConfig, NavItemBase, Placement, TabBase, WidgetBase, WidgetWidth,
} from './types';
import { PLACEMENTS } from './types';
import { resolveNavState, resolveTabsState, resolveWidgetsState } from './resolve';

export interface EditorContext {
  navItems: NavItemBase[];
  /** Tabs by page id. */
  tabs: Record<string, TabBase[]>;
  widgets: WidgetBase[];
  /** The widget area being edited (the overview). */
  areaId: string;
  can: CanFn;
  hasEmployee: boolean;
}

export interface TabsEditorState {
  order: string[];
  hidden: string[];
  /** The tab that opens first (the resolved one, not just a stated preference). */
  default: string | null;
}

export interface EditorState {
  nav: { lists: Record<Placement, string[]>; hidden: string[] };
  tabs: Record<string, TabsEditorState>;
  widgets: { order: string[]; hidden: string[]; widths: Record<string, WidgetWidth> };
}

type Layers = (LayoutConfig | null | undefined)[];

/** What this stack of layers resolves to, for every item the viewer can access. */
export function stateFromLayers(ctx: EditorContext, layers: Layers): EditorState {
  const nav = resolveNavState({ items: ctx.navItems, can: ctx.can, hasEmployee: ctx.hasEmployee, layers });

  const tabs: Record<string, TabsEditorState> = {};
  for (const [pageId, list] of Object.entries(ctx.tabs)) {
    const s = resolveTabsState({ pageId, tabs: list, can: ctx.can, layers });
    // Same default rule as the page: a stated preference only counts if that
    // tab is visible, otherwise the first visible one.
    const visible = s.order.filter((id) => !s.hidden.has(id));
    const firstShown = (visible.length ? visible : s.order)[0] ?? null;
    tabs[pageId] = {
      order: s.order,
      hidden: [...s.hidden].filter((id) => s.byId.has(id)),
      default: s.preferred && visible.includes(s.preferred) ? s.preferred : firstShown,
    };
  }

  const w = resolveWidgetsState({ areaId: ctx.areaId, widgets: ctx.widgets, can: ctx.can, layers });
  return {
    // A layer can name ids the viewer can't access; those aren't theirs to edit.
    nav: { lists: nav.lists, hidden: [...nav.hidden].filter((id) => nav.byId.has(id)) },
    tabs,
    widgets: { order: w.order, hidden: [...w.hidden].filter((id) => w.byId.has(id)), widths: Object.fromEntries(w.widths) },
  };
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** The sparse layer that, applied on top of `baseline`'s layers, produces
 *  `desired`. Empty sections are left out, so no change gives `{ v: 1 }`. */
export function diffState(ctx: EditorContext, baseline: EditorState, desired: EditorState): LayoutConfig {
  const out: LayoutConfig = { v: 1 };

  // Navigation
  const items: NonNullable<NonNullable<LayoutConfig['nav']>['items']> = {};
  const placementIn = (s: EditorState) => {
    const m = new Map<string, Placement>();
    for (const p of PLACEMENTS) for (const id of s.nav.lists[p]) m.set(id, p);
    return m;
  };
  const basePlacement = placementIn(baseline);
  const wantPlacement = placementIn(desired);
  const baseHidden = new Set(baseline.nav.hidden);
  const wantHidden = new Set(desired.nav.hidden);
  for (const id of wantPlacement.keys()) {
    const entry: { hidden?: boolean; placement?: Placement } = {};
    if (wantPlacement.get(id) !== basePlacement.get(id)) entry.placement = wantPlacement.get(id);
    if (wantHidden.has(id) !== baseHidden.has(id)) entry.hidden = wantHidden.has(id);
    if (Object.keys(entry).length) items[id] = entry;
  }
  const order: NonNullable<NonNullable<LayoutConfig['nav']>['order']> = {};
  for (const p of PLACEMENTS) {
    if (!same(baseline.nav.lists[p], desired.nav.lists[p])) order[p] = desired.nav.lists[p];
  }
  if (Object.keys(items).length || Object.keys(order).length) {
    out.nav = {};
    if (Object.keys(items).length) out.nav.items = items;
    if (Object.keys(order).length) out.nav.order = order;
  }

  // Page tabs
  const tabs: NonNullable<LayoutConfig['tabs']> = {};
  for (const pageId of Object.keys(ctx.tabs)) {
    const base = baseline.tabs[pageId];
    const want = desired.tabs[pageId];
    if (!base || !want) continue;
    const entry = visibilityDiff(base.hidden, want.hidden) as NonNullable<LayoutConfig['tabs']>[string];
    if (!same(base.order, want.order)) entry.order = want.order;
    // A default that the same edit hides isn't a real choice (the page would
    // ignore it), so it isn't saved.
    if (want.default && !want.hidden.includes(want.default) && want.default !== base.default) entry.default = want.default;
    if (Object.keys(entry).length) tabs[pageId] = entry;
  }
  if (Object.keys(tabs).length) out.tabs = tabs;

  // Widgets
  const entry = visibilityDiff(baseline.widgets.hidden, desired.widgets.hidden) as NonNullable<LayoutConfig['widgets']>[string];
  if (!same(baseline.widgets.order, desired.widgets.order)) entry.order = desired.widgets.order;
  const width: Record<string, WidgetWidth> = {};
  for (const [id, w] of Object.entries(desired.widgets.widths)) {
    if (baseline.widgets.widths[id] !== w) width[id] = w;
  }
  if (Object.keys(width).length) entry.width = width;
  if (Object.keys(entry).length) out.widgets = { [ctx.areaId]: entry };

  return out;
}

/** `hidden` for ids newly hidden, `shown` for ids the baseline hid that are
 *  now visible. Either list is left out when empty. */
function visibilityDiff(base: string[], want: string[]): { hidden?: string[]; shown?: string[] } {
  const baseSet = new Set(base);
  const wantSet = new Set(want);
  // Sorted so the same edit always saves the same layout, whatever order it was clicked in.
  const hidden = want.filter((id) => !baseSet.has(id)).sort();
  const shown = base.filter((id) => !wantSet.has(id)).sort();
  const out: { hidden?: string[]; shown?: string[] } = {};
  if (hidden.length) out.hidden = hidden;
  if (shown.length) out.shown = shown;
  return out;
}

/** True when the layer overrides nothing (so saving it should clear it). */
export const isEmptyLayout = (config: LayoutConfig) => Object.keys(config).every((k) => k === 'v');

// ── Where a setting came from ───────────────────────────────────────────────

export interface LabelledLayer {
  /** Shown to the person: "You", "Leadership role", "Restaurant:read". */
  label: string;
  config: LayoutConfig;
}

type Probe = (config: LayoutConfig) => boolean;

const sourceOf = (layers: LabelledLayer[], probe: Probe): string | null => {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (probe(layers[i].config)) return layers[i].label;
  }
  return null;
};

/** Which layer (highest first) last said something about a nav item. */
export const navItemSource = (layers: LabelledLayer[], id: string) =>
  sourceOf(layers, (c) => !!c.nav?.items?.[id] || PLACEMENTS.some((p) => c.nav?.order?.[p]?.includes(id)));

export const tabSource = (layers: LabelledLayer[], pageId: string, id: string) =>
  sourceOf(layers, (c) => {
    const t = c.tabs?.[pageId];
    return !!t && (!!t.hidden?.includes(id) || !!t.shown?.includes(id) || !!t.order?.includes(id) || t.default === id);
  });

export const widgetSource = (layers: LabelledLayer[], areaId: string, id: string) =>
  sourceOf(layers, (c) => {
    const w = c.widgets?.[areaId];
    return !!w && (!!w.hidden?.includes(id) || !!w.shown?.includes(id) || !!w.order?.includes(id) || id in (w.width ?? {}));
  });
