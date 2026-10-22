import React from "react";
import type { EditorState, LabelledLayer } from "@/lib/layout/editor";
import { widgetSource } from "@/lib/layout/editor";
import { OVERVIEW_AREA, OVERVIEW_WIDGETS, type OverviewWidget } from "@/lib/layout/registry";
import { WIDTHS, type WidgetWidth } from "@/lib/layout/types";
import SortableList from "./SortableList";
import EditorRow, { SourceBadge } from "./EditorRow";

const WIDTH_LABELS: Record<WidgetWidth, string> = { sixth: "1/6", third: "1/3", half: "1/2", full: "Full" };
const SECTION_LABELS = { group: "Group", leadership: "Leadership" } as const;
const byId = new Map<string, OverviewWidget>(OVERVIEW_WIDGETS.map((w) => [w.id, w]));

/** Overview widgets: order, show/hide and width. The Group heading and year
 *  picker is not listed, it follows the Group widgets by itself. */
export default function WidgetsEditor({
  state, onChange, layers,
}: {
  state: EditorState;
  onChange: (next: EditorState) => void;
  layers: LabelledLayer[];
}) {
  const { order, hidden, widths } = state.widgets;
  const hiddenSet = new Set(hidden);
  const update = (patch: Partial<EditorState["widgets"]>) => onChange({ ...state, widgets: { ...state.widgets, ...patch } });

  if (order.length === 0) return <p className="text-sm text-muted-foreground">There are no overview widgets you can see.</p>;

  return (
    <div className="max-w-2xl space-y-3">
      <SortableList
        listId="widgets"
        items={order.map((id) => ({ id }))}
        onReorder={(ids) => update({ order: ids })}
        renderItem={({ id }, handle, dragging) => {
          const widget = byId.get(id)!;
          return (
            <EditorRow
              handle={handle}
              dragging={dragging}
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
                  value={widths[id]}
                  onChange={(e) => update({ widths: { ...widths, [id]: e.target.value as WidgetWidth } })}
                  aria-label={`Width of ${widget.label}`}
                  className="text-xs bg-background border border-border rounded px-1.5 py-1 text-muted-foreground"
                >
                  {WIDTHS.map((w) => <option key={w} value={w}>{WIDTH_LABELS[w]}</option>)}
                </select>
              }
              onToggleHidden={() =>
                update({ hidden: hiddenSet.has(id) ? hidden.filter((x) => x !== id) : [...hidden, id] })
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
