import React from "react";
import { Phone, ArrowUp, ArrowDown, AlertTriangle, Armchair, Trash2, Loader2 } from "lucide-react";
import type { GuestSignIn } from "@/api/guestSignInsApi";
import { waPhone, isEmail } from "@/lib/checkin";

// A host stops seeing this as "the system still has it handled" after this
// long without a seat - an advisory flag only, staff still decide what to do.
const GRACE_MINUTES = 12;
const isAtRisk = (s: GuestSignIn) =>
  s.notifiedAt != null && (Date.now() - new Date(s.notifiedAt).getTime()) / 60_000 > GRACE_MINUTES;

function elapsed(iso: string): string {
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** One entry in the physical queue at the door: on premises, no table yet.
 *  Shared by Guest Register and Floor View's Waiting panel. */
export default function WaitingRow({
  s, canWrite, canDelete, isFirst, isLast, notifying, reordering,
  onNotify, onAssign, onCancel, onDelete, onMoveUp, onMoveDown,
}: {
  s: GuestSignIn;
  canWrite: boolean; canDelete: boolean;
  isFirst: boolean; isLast: boolean;
  notifying: boolean; reordering: boolean;
  onNotify: () => void; onAssign: () => void; onCancel: () => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const notified = s.notifiedAt != null;
  const atRisk = isAtRisk(s);
  const wa = waPhone(s.guestPhone);
  const canNotify = wa != null || isEmail(s.guestEmail);
  return (
    <div className="border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{s.guestName}</span>
          <span className="text-muted-foreground">party of {s.partySize}</span>
          {s.source === "self" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Self check-in</span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={notified ? { backgroundColor: "#3b82f620", color: "#3b82f6" } : { backgroundColor: "#f59e0b20", color: "#f59e0b" }}>
            {notified ? "Notified" : "Waiting"}
          </span>
          {atRisk && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> At risk
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {s.areaName ?? "Any area"} · waiting {elapsed(s.signedInAt)}
          {s.quotedWaitMinutes != null && ` · quoted ~${s.quotedWaitMinutes}m`}
          {s.notifiedAt && ` · notified ${elapsed(s.notifiedAt)} ago`}
        </div>
        {s.guestPhone && (
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {s.guestPhone}</div>
        )}
        {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
      </div>
      {canWrite && (
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <div className="flex flex-col">
            <button onClick={onMoveUp} disabled={isFirst || reordering} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={onMoveDown} disabled={isLast || reordering} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
          {!notified && canNotify && (
            <button onClick={onNotify} disabled={notifying} className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50">
              {notifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />} {wa ? "Message on WhatsApp" : "Message by email"}
            </button>
          )}
          <button onClick={onAssign} className="flex items-center gap-1 text-primary hover:underline">
            <Armchair className="w-3.5 h-3.5" /> Assign table
          </button>
          <button onClick={onCancel} className="text-muted-foreground hover:text-destructive">Cancel</button>
          {canDelete && (
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )}
    </div>
  );
}
