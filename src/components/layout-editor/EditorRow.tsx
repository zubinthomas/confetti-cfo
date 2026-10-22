import React from "react";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

/** Which layer set an item, e.g. "Leadership role" or "You". */
export function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap" title="The layer that last changed this">
      {source}
    </span>
  );
}

/** One row in an editor list: drag handle, label, badges, extra controls and
 *  a show/hide toggle. A hidden row stays in the list, dimmed. */
export default function EditorRow({
  handle, dragging, hidden, label, icon, badges, controls, onToggleHidden, canToggle = true, toggleTitle,
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
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-sm ${
        dragging ? "border-primary shadow-lg" : "border-border"
      } ${hidden ? "opacity-60" : ""}`}
    >
      <span {...(handle ?? {})} className="cursor-grab text-muted-foreground/70 hover:text-foreground px-0.5" aria-label={`Drag to reorder ${label}`}>
        <GripVertical className="w-4 h-4" />
      </span>
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <span className={`flex-1 min-w-0 truncate ${hidden ? "line-through text-muted-foreground" : "text-foreground"}`}>{label}</span>
      {badges}
      {controls}
      <button
        type="button"
        onClick={onToggleHidden}
        disabled={!canToggle}
        title={toggleTitle ?? (hidden ? "Show" : "Hide")}
        aria-label={`${hidden ? "Show" : "Hide"} ${label}`}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
