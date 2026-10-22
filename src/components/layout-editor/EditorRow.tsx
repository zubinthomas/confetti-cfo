import React from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import type { RowMove } from "./SortableList";

/** Which layer set an item, e.g. "Leadership role" or "You". */
export function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap" title="The layer that last changed this">
      {source}
    </span>
  );
}

// Touch-sized (44px) on phones, compact from sm up. Selects and inputs use 16px
// text on phones so iOS doesn't zoom the page when they are focused.
export const ICON_BUTTON = "inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent max-sm:w-11 max-sm:h-11 sm:p-1";
export const ROW_SELECT = "bg-background border border-border rounded text-muted-foreground max-sm:text-base max-sm:h-11 max-sm:px-2 sm:text-xs sm:px-1.5 sm:py-1";

/** One row in an editor list: drag handle, label, badges, extra controls and
 *  a show/hide toggle. A hidden row stays in the list, dimmed. On a phone the
 *  badges and controls wrap onto a second line instead of squeezing the label,
 *  and move up/down buttons stand in for dragging. */
export default function EditorRow({
  handle, dragging, hidden, label, icon, badges, controls, onToggleHidden, canToggle = true, toggleTitle, move,
}: {
  handle?: DraggableProvidedDragHandleProps | null;
  dragging?: boolean;
  hidden: boolean;
  label: string;
  icon?: React.ReactNode;
  badges?: React.ReactNode;
  controls?: React.ReactNode;
  onToggleHidden: () => void;
  canToggle?: boolean;
  toggleTitle?: string;
  move?: RowMove;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-2 py-1.5 text-sm ${
        dragging ? "border-primary shadow-lg" : "border-border"
      } ${hidden ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-[10rem]">
        <span
          {...(handle ?? {})}
          className="cursor-grab touch-none text-muted-foreground/70 hover:text-foreground inline-flex items-center justify-center max-sm:w-9 max-sm:h-11 px-0.5"
          aria-label={`Drag to reorder ${label}`}
        >
          <GripVertical className="w-4 h-4" />
        </span>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <span className={`min-w-0 break-words ${hidden ? "line-through text-muted-foreground" : "text-foreground"}`}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap ml-auto max-sm:w-full max-sm:justify-end">
        {badges}
        {controls}
        {move && (
          // Dragging fights with scrolling on touch screens, so phones get buttons.
          <span className="hidden max-sm:inline-flex [@media(pointer:coarse)]:inline-flex items-center">
            <button type="button" onClick={move.up ?? undefined} disabled={!move.up} aria-label={`Move ${label} up`} className={ICON_BUTTON}>
              <ChevronUp className="w-4 h-4" />
            </button>
            <button type="button" onClick={move.down ?? undefined} disabled={!move.down} aria-label={`Move ${label} down`} className={ICON_BUTTON}>
              <ChevronDown className="w-4 h-4" />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onToggleHidden}
          disabled={!canToggle}
          title={toggleTitle ?? (hidden ? "Show" : "Hide")}
          aria-label={`${hidden ? "Show" : "Hide"} ${label}`}
          className={ICON_BUTTON}
        >
          {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
