import React from "react";
import { Star } from "lucide-react";
import type { EditorState, LabelledLayer } from "@/lib/layout/editor";
import { tabSource } from "@/lib/layout/editor";
import { PAGE_LABELS, PAGE_TABS, type PageId, type TabItem } from "@/lib/layout/registry";
import SortableList from "./SortableList";
import EditorRow, { SourceBadge } from "./EditorRow";

/** Tab order, visibility and the tab a page opens on, for every page with
 *  more than one tab to choose between. */
export default function TabsEditor({
  state, onChange, layers,
}: {
  state: EditorState;
  onChange: (next: EditorState) => void;
  layers: LabelledLayer[];
}) {
  const pages = (Object.keys(PAGE_TABS) as PageId[]).filter((p) => (state.tabs[p]?.order.length ?? 0) > 1);
  if (pages.length === 0) {
    return <p className="text-sm text-muted-foreground">No page you can open has more than one tab to arrange.</p>;
  }

  const update = (page: PageId, patch: Partial<EditorState["tabs"][string]>) =>
    onChange({ ...state, tabs: { ...state.tabs, [page]: { ...state.tabs[page], ...patch } } });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {pages.map((page) => {
        const tabs = state.tabs[page];
        const meta = new Map<string, TabItem>(PAGE_TABS[page].map((t) => [t.id, t]));
        const hidden = new Set(tabs.hidden);
        const visibleCount = tabs.order.filter((id) => !hidden.has(id)).length;
        return (
          <section key={page} className="space-y-1.5">
            <h4 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-2">{PAGE_LABELS[page]}</h4>
            <SortableList
              listId={`tabs:${page}`}
              items={tabs.order.map((id) => ({ id }))}
              onReorder={(order) => update(page, { order })}
              renderItem={({ id }, handle, dragging) => {
                const tab = meta.get(id)!;
                const Icon = tab.icon;
                const isHidden = hidden.has(id);
                const isDefault = tabs.default === id;
                return (
                  <EditorRow
                    handle={handle}
                    dragging={dragging}
                    hidden={isHidden}
                    label={tab.label}
                    icon={Icon ? <Icon className="w-4 h-4" /> : undefined}
                    badges={<SourceBadge source={tabSource(layers, page, id)} />}
                    controls={
                      <button
                        type="button"
                        disabled={isHidden}
                        onClick={() => update(page, { default: id })}
                        title={isDefault ? "Opens first" : "Open this tab first"}
                        aria-label={isDefault ? `${tab.label} opens first` : `Make ${tab.label} open first`}
                        className={`p-1 rounded disabled:opacity-30 ${isDefault ? "text-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                      >
                        <Star className="w-4 h-4" fill={isDefault ? "currentColor" : "none"} />
                      </button>
                    }
                    // The last visible tab can't be hidden: a page needs one.
                    canToggle={isHidden || visibleCount > 1}
                    toggleTitle={!isHidden && visibleCount <= 1 ? "A page needs at least one tab" : undefined}
                    onToggleHidden={() => {
                      const nextHidden = isHidden ? tabs.hidden.filter((x) => x !== id) : [...tabs.hidden, id];
                      const stillShown = tabs.order.filter((x) => !nextHidden.includes(x));
                      // Hiding the tab that opens first hands that role to the next visible one.
                      const nextDefault = tabs.default && nextHidden.includes(tabs.default) ? stillShown[0] ?? null : tabs.default;
                      update(page, { hidden: nextHidden, default: nextDefault });
                    }}
                  />
                );
              }}
            />
          </section>
        );
      })}
    </div>
  );
}
