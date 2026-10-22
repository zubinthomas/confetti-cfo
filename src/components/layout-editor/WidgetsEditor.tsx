import React from "react";
import type { EditorState, LabelledLayer } from "@/lib/layout/editor";
import { widgetSource } from "@/lib/layout/editor";
import { OVERVIEW_AREA, OVERVIEW_WIDGETS, type OverviewWidget } from "@/lib/layout/registry";
import { WIDTHS, type WidgetWidth } from "@/lib/layout/types";
import SortableList from "./SortableList";
import EditorRow, { ROW_SELECT, SourceBadge } from "./EditorRow";

const WIDTH_LABELS: Record<WidgetWidth, string> = { sixth: "1/6", third: "1/3", half: "1/2", full: "Full" };
const SECTION_LABELS = { group: "Group", leadership: "Leadership" } as const;
const byId = new Map<string, OverviewWidget>(OVERVIEW_WIDGETS.map((w) => [w.id, w]));

type Update = (fn: (s: EditorState) => EditorState) => void;

/** Overview widgets: order, show/hide and width. The Group heading and year
 *  picker is not listed, it follows the Group widgets by itself. */
export default function WidgetsEditor({
  state, onChange, layers,
}: {
  state: EditorState;
  onChange: Update;
  layers: LabelledLayer[];
}) {
  const { order, hidden } = state.widgets;
  const hiddenSet = new Set(hidden);
  const update = (fn: (w: EditorState["widgets"]) => EditorState["widgets"]) =>
    onChange((s) => ({ ...s, widgets: fn(s.widgets) }));

  if (order.length === 0) return <p className="text-sm text-muted-foreground">There are no overview widgets you can see.</p>;

  return (
    <div className="max-w-2xl space-y-3">
      <SortableList
        listId="widgets"
        items={order.map((id) => ({ id }))}
        onReorder={(ids) => update((w) => ({ ...w, order: ids }))}
        renderItem={({ id }, handle, dragging, move) => {
          const widget = byId.get(id)!;
          return (
            <EditorRow
              handle={handle}
              dragging={dragging}
              move={move}
              hidden={hiddenSet.has(id)}
              label={widget.label}
              badges={
                <>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground whitespace-nowrap">
                    {SECTION_LABELS[widget.source]}
                  </span>
                  <SourceBadge source={widgetSource(layers, OVERVIEW_AREA, id)} />
                </>
              }
              controls={
                <select
                  value={state.widgets.widths[id]}
                  onChange={(e) => {
                    const width = e.target.value as WidgetWidth;
                    update((w) => ({ ...w, widths: { ...w.widths, [id]: width } }));
                  }}
                  aria-label={`Width of ${widget.label}`}
                  className={ROW_SELECT}
                >
                  {WIDTHS.map((w) => <option key={w} value={w}>{WIDTH_LABELS[w]}</option>)}
                </select>
              }
              onToggleHidden={() =>
                update((w) => ({ ...w, hidden: w.hidden.includes(id) ? w.hidden.filter((x) => x !== id) : [...w.hidden, id] }))
              }
            />
          );
        }}
      />
      <p className="text-[11px] text-muted-foreground">
        Widths are a share of the row: 1/6 fits six across, 1/3 three, 1/2 two. Narrow screens stack them.
      </p>
    </div>
  );
}
