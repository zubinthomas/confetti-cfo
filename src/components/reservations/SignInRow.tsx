import React, { useState } from "react";
import { Armchair, Clock, LogOut, Pencil, Trash2 } from "lucide-react";
import type { GuestSignIn, GuestVisitType } from "@/api/guestSignInsApi";
import { prettyDate } from "@/components/reservations/reservationUi";
import { istClock, istDateStr } from "@/lib/ist";

const clockOf = istClock;

export const VISIT_LABELS: Record<GuestVisitType, string> = { walk_in: "Walk-in", event: "Event" };
export const VISIT_COLORS: Record<GuestVisitType, string> = { walk_in: "#3b82f6", event: "#8b5cf6" };
const EXTEND_STEPS = [15, 30, 60];
const ICON_BTN = "inline-flex items-center justify-center text-muted-foreground max-sm:w-11 max-sm:h-11 sm:p-1";

/** One guest-register entry: who, party, where they sat and when, with the
 *  row actions (assign / extend / sign out for guests still in, edit / delete
 *  for everyone). Shared by the live register and the All list. */
export default function SignInRow({
  s, canWrite, canDelete, showDate, onAssign, onEdit, onSignOut, onDelete, onExtend,
}: {
  s: GuestSignIn;
  /** Prefix the sign-in time with its IST date (for lists that span days). */
  showDate?: boolean;
  canWrite: boolean; canDelete: boolean;
  onAssign: () => void; onEdit: () => void; onSignOut: () => void; onDelete: () => void;
  onExtend: (minutes: number) => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const out = s.signedOutAt;
  return (
    <div className="border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{s.guestName}</span>
          <span className="text-muted-foreground">party of {s.partySize}</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${VISIT_COLORS[s.visitType]}20`, color: VISIT_COLORS[s.visitType] }}>
            {VISIT_LABELS[s.visitType]}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {s.areaName ?? "—"} · {s.tableName ? <span className="text-foreground">{s.tableName}</span> : "unseated"}
          {" · in "}{showDate && `${prettyDate(istDateStr(new Date(s.signedInAt)))} `}{clockOf(s.signedInAt)}
          {out && ` – ${clockOf(out)} out`}
          {!out && s.expectedUntil && s.tableId && ` · until ~${clockOf(s.expectedUntil)}`}
        </div>
        {(s.host || s.purpose) && (
          <div className="text-xs text-muted-foreground">
            {s.host && <>Host: {s.host}</>}{s.host && s.purpose && " · "}{s.purpose}
          </div>
        )}
        {s.reservationId && (
          <div className="text-xs text-primary">↳ booking {s.reservationTime ?? ""} ({s.reservationGuestName ?? ""})</div>
        )}
      </div>
      {canWrite && !out && (
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <button onClick={onAssign} className="flex items-center gap-1 text-primary hover:underline max-sm:min-h-11">
            <Armchair className="w-3.5 h-3.5" /> {s.tableId ? "Change table" : "Assign table"}
          </button>
          {s.tableId && (
            <div className="relative">
              <button onClick={() => setExtendOpen((v) => !v)} className="flex items-center gap-1 text-primary hover:underline max-sm:min-h-11">
                <Clock className="w-3.5 h-3.5" /> Extend
              </button>
              {extendOpen && (
                <div className="absolute right-0 mt-1 z-10 bg-card border border-border rounded-lg p-1 flex gap-1 shadow-md">
                  {EXTEND_STEPS.map((m) => (
                    <button key={m} onClick={() => { setExtendOpen(false); onExtend(m); }}
                      className="text-xs px-2 py-1 max-sm:min-h-11 rounded hover:bg-muted">+{m}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={onSignOut} className="flex items-center gap-1 text-primary hover:underline max-sm:min-h-11">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
          <button onClick={onEdit} aria-label="Edit entry" className={`${ICON_BTN} hover:text-foreground`}><Pencil className="w-3.5 h-3.5" /></button>
          {canDelete && (
            <button onClick={onDelete} aria-label="Delete entry" className={`${ICON_BTN} hover:text-destructive`}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )}
      {canWrite && out && (
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} aria-label="Edit entry" className={`${ICON_BTN} hover:text-foreground`}><Pencil className="w-3.5 h-3.5" /></button>
          {canDelete && (
            <button onClick={onDelete} aria-label="Delete entry" className={`${ICON_BTN} hover:text-destructive`}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )}
    </div>
  );
}
