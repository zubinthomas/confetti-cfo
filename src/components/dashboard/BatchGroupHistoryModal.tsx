import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { ImportBatch, DecisionSource } from "@/api/importApi";
import type { BatchGroup } from "./groupImportBatches";
import { localDay } from "@/lib/localDay";

const STATUS_STYLE: Record<ImportBatch["status"], string> = {
  preview: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  committed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  discarded: "bg-muted text-muted-foreground",
};

/** What actually happened to this instance, in plain words - this is what
 *  tells a manually-decided occurrence apart from an auto-resolved or
 *  still-pending one in the same history list. */
function decisionLabel(b: ImportBatch): string {
  const source = b.decisionSource as DecisionSource | null;
  if (source === "manual") return b.status === "committed" ? "Manually approved" : "Manually rejected";
  if (source === "auto_commit") return "Auto-committed";
  if (source === "auto_discard_noop") return "Auto-discarded · no changes";
  if (source === "auto_discard_duplicate_rejected") return "Auto-discarded · duplicate of a rejected change";
  if (source === "auto_discard_superseded") return "Auto-discarded · superseded by a newer sync";
  return "Pending review";
}

function InstanceRow({ b }: { b: ImportBatch }) {
  const isManual = b.decisionSource === "manual";
  return (
    <div
      className={`flex items-center justify-between gap-3 text-xs py-2 px-2.5 rounded-lg ${
        isManual ? "border-l-2 border-primary bg-primary/5" : "border-l-2 border-transparent"
      }`}
    >
      <div className="min-w-0">
        <span className="text-foreground">{new Date(b.uploadedAt).toLocaleTimeString()}</span>
        <span className="text-muted-foreground"> · #{b.id}</span>
        <p className={isManual ? "text-foreground font-medium" : "text-muted-foreground"}>
          {decisionLabel(b)}
          {isManual && b.decidedByEmail && ` by ${b.decidedByEmail}`}
        </p>
      </div>
      <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status]}`}>
        {b.status}
      </span>
    </div>
  );
}

export interface BatchGroupHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: BatchGroup | null;
}

export default function BatchGroupHistoryModal({ open, onOpenChange, group }: BatchGroupHistoryModalProps) {
  const days = group
    ? [...new Set(group.instances.map((b) => localDay(b.uploadedAt)))]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {group ? `${group.instances.length} occurrence${group.instances.length === 1 ? "" : "s"} · ${group.representative.filename}` : "History"}
          </DialogTitle>
        </DialogHeader>
        {days.map((day) => (
          <div key={day} className="mb-3">
            <p className="text-xs font-semibold text-foreground mb-1.5">
              {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </p>
            <div className="space-y-0.5">
              {group!.instances
                .filter((b) => localDay(b.uploadedAt) === day)
                .map((b) => <InstanceRow key={b.id} b={b} />)}
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
