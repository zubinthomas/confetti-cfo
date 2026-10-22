import React from "react";
import type { EditorState, LabelledLayer } from "@/lib/layout/editor";
import { navItemSource } from "@/lib/layout/editor";
import { NAV_ITEMS, type NavItem } from "@/lib/layout/registry";
import { PLACEMENTS, type Placement } from "@/lib/layout/types";
import SortableList, { type RowMove } from "./SortableList";
import EditorRow, { ROW_SELECT, SourceBadge } from "./EditorRow";

const PLACEMENT_LABELS: Record<Placement, string> = { sidebar: "Sidebar", header: "Top bar", userMenu: "User menu" };
const byId = new Map<string, NavItem>(NAV_ITEMS.map((i) => [i.id, i]));

type Update = (fn: (s: EditorState) => EditorState) => void;

/** Sidebar (grouped, reorder inside a group), top bar and user menu lists.
 *  Each item can be hidden or moved to another place. Every change is a
 *  functional update, so it always applies to the latest state. */
export default function NavEditor({
  state, onChange, layers,
}: {
  state: EditorState;
  onChange: Update;
  layers: LabelledLayer[];
}) {
  const { lists, hidden } = state.nav;
  const hiddenSet = new Set(hidden);

  const setLists = (fn: (l: Record<Placement, string[]>) => Record<Placement, string[]>) =>
    onChange((s) => ({ ...s, nav: { ...s.nav, lists: fn(s.nav.lists) } }));
  const toggle = (id: string) =>
    onChange((s) => ({
      ...s,
      nav: { ...s.nav, hidden: s.nav.hidden.includes(id) ? s.nav.hidden.filter((x) => x !== id) : [...s.nav.hidden, id] },
    }));
  const move = (id: string, to: Placement) =>
    setLists((l) => {
      const next = { ...l };
      for (const p of PLACEMENTS) next[p] = next[p].filter((x) => x !== id);
      next[to] = [...next[to], id];
      return next;
    });

  const row = (id: string, handle: Parameters<typeof EditorRow>[0]["handle"], dragging: boolean, current: Placement, rowMove: RowMove) => {
    const item = byId.get(id)!;
    const Icon = item.icon;
    return (
      <EditorRow
        handle={handle}
        dragging={dragging}
        move={rowMove}
        hidden={hiddenSet.has(id)}
        label={item.label}
        icon={<Icon className="w-4 h-4" />}
        badges={<SourceBadge source={navItemSource(layers, id)} />}
        controls={
          <select
            value={current}
            onChange={(e) => move(id, e.target.value as Placement)}
            aria-label={`Where ${item.label} appears`}
            className={ROW_SELECT}
          >
            {PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>)}
          </select>
        }
        onToggleHidden={() => toggle(id)}
      />
    );
  };

  // Sidebar sections follow registry order; reordering is within a section.
  const groups: (string | null)[] = [];
  for (const item of NAV_ITEMS) if (!groups.includes(item.group)) groups.push(item.group);
  const sidebarGroups = groups
    .map((group) => ({ group, ids: lists.sidebar.filter((id) => byId.get(id)?.group === group) }))
    .filter((g) => g.ids.length > 0);
  const reorderGroup = (group: string | null, ids: string[]) =>
    setLists((l) => {
      const current = groups
        .map((g) => ({ group: g, ids: l.sidebar.filter((id) => byId.get(id)?.group === g) }))
        .filter((g) => g.ids.length > 0);
      return { ...l, sidebar: current.flatMap((g) => (g.group === group ? ids : g.ids)) };
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4">
        <h4 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{PLACEMENT_LABELS.sidebar}</h4>
        {sidebarGroups.map(({ group, ids }) => (
          <div key={group ?? "top"} className="space-y-1.5">
            {group && <p className="text-[11px] text-muted-foreground px-1">{group}</p>}
            <SortableList
              listId={`sidebar:${group ?? "top"}`}
              items={ids.map((id) => ({ id }))}
              onReorder={(next) => reorderGroup(group, next)}
              renderItem={({ id }, handle, dragging, rowMove) => row(id, handle, dragging, "sidebar", rowMove)}
            />
          </div>
        ))}
      </section>

      <div className="space-y-6">
        {(["header", "userMenu"] as const).map((placement) => (
          <section key={placement} className="space-y-1.5">
            <h4 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-2">{PLACEMENT_LABELS[placement]}</h4>
            {lists[placement].length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Nothing here. Use the menu on any item to move it.</p>
            ) : (
              <SortableList
                listId={placement}
                items={lists[placement].map((id) => ({ id }))}
                onReorder={(next) => setLists((l) => ({ ...l, [placement]: next }))}
                renderItem={({ id }, handle, dragging, rowMove) => row(id, handle, dragging, placement, rowMove)}
              />
            )}
          </section>
        ))}
        <p className="text-[11px] text-muted-foreground">
          Hiding or moving a link never changes what you can open: the page is still reachable by its address if you have access.
        </p>
      </div>
    </div>
  );
}
