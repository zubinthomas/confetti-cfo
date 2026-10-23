import React, { useState } from "react";
import { Clock, Link2, Link2Off, Trash2 } from "lucide-react";
import type { ReservationStatus, ReservationTable, Reservation, TableMerge } from "@/api/reservationsApi";
import { ArchivedBadge } from "@/components/reservations/CatalogParts";
import MoveBooking from "@/components/reservations/MoveBooking";
import { STATUS_COLORS, STATUS_LABELS, NEXT_ACTIONS, endTime, isLateBooking, type FloorInfo } from "@/components/reservations/reservationUi";

export const FLOOR_DOT: Record<FloorInfo["state"], string> = {
  free: "#10b981", reserved: "#f59e0b", late: "#ef4444", occupied: "#8b5cf6",
};
const FLOOR_EXTEND_STEPS = [15, 30, 60];

/** One table, or one merged unit, on the selected day: what the day view needs to draw it. */
export interface TableUnit {
  key: string;
  table: ReservationTable;
  merge?: TableMerge;
  bookings: Reservation[];
  floor: FloorInfo;
}

function TableFloorLine({ floor, canWrite, onExtend, onFree }: {
  floor: FloorInfo; canWrite: boolean; onExtend: (m: number) => void; onFree: () => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
      <span className="text-xs flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOOR_DOT[floor.state] }} />
        <span className="text-muted-foreground">{floor.label}{floor.until ? ` · until ${floor.until}` : ""}</span>
      </span>
      {canWrite && floor.state === "occupied" && (
        <span className="flex items-center gap-2 text-xs">
          <span className="relative">
            <button onClick={() => setExtendOpen((v) => !v)} className="flex items-center gap-1 text-primary hover:underline">
              <Clock className="w-3.5 h-3.5" /> Extend
            </button>
            {extendOpen && (
              <span className="absolute right-0 mt-1 z-10 bg-card border border-border rounded-lg p-1 flex gap-1 shadow-md">
                {FLOOR_EXTEND_STEPS.map((m) => (
                  <button key={m} onClick={() => { setExtendOpen(false); onExtend(m); }}
                    className="text-xs px-2 py-1 rounded hover:bg-muted">+{m}</button>
                ))}
              </span>
            )}
          </span>
          <button onClick={onFree} className="text-primary hover:underline">Free table</button>
        </span>
      )}
    </div>
  );
}

/** The full card for a table or merged unit: floor state with Extend / Free
 *  table, Split for a merge, and the day's bookings with their status actions.
 *  The List layout renders it inline and the floor map opens it in a dialog. */
export default function TableCard({
  unit, bordered = true, bookWrite, bookDelete, mergeWrite, floorWritable,
  onSplit, onExtend, onFree, onStatus, onRemove, onMoved, nowMin,
}: {
  unit: TableUnit;
  bordered?: boolean;
  bookWrite: boolean; bookDelete: boolean; mergeWrite: boolean;
  /** Free table / Extend need write on every part the table has (booking, guests). */
  floorWritable: boolean;
  onSplit: () => void;
  onExtend: (minutes: number) => void;
  onFree: () => void;
  onStatus: (id: string, status: ReservationStatus) => void;
  onRemove: (id: string) => void;
  onMoved: () => void;
  nowMin: number;
}) {
  const { table: t, merge, bookings, floor } = unit;
  return (
    <div className={bordered ? "border border-border rounded-lg p-3" : ""}>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
          {merge && <Link2 className="w-3.5 h-3.5 text-primary" />}
          {merge ? merge.tableNames.join(" ＋ ") : t.name}
          {t.archivedAt && <ArchivedBadge />}
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-2">
          seats {merge ? `${merge.combinedCapacity} (merged)` : `${t.capacity}${t.maxExtraCapacity ? ` +${t.maxExtraCapacity}` : ""}`}
          {merge && mergeWrite && (
            <button onClick={onSplit} className="text-primary hover:underline flex items-center gap-1">
              <Link2Off className="w-3.5 h-3.5" /> Split
            </button>
          )}
        </span>
      </div>
      <TableFloorLine floor={floor} canWrite={floorWritable} onExtend={onExtend} onFree={onFree} />
      {bookings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No bookings today</p>
      ) : (
        <div className="space-y-1.5">
          {bookings.map((r) => {
            // Someone other than this party is on the table: it can't be seated here.
            const taken = floor.state === "occupied" && floor.seatedBooking?.id !== r.id;
            const late = taken && bookWrite && isLateBooking(r, nowMin);
            return (
              <div key={r.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm flex-wrap">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{r.time}–{endTime(r.time, r.durationMinutes)}</span>{" "}
                    <span className="text-muted-foreground">· {r.guestName} · party of {r.partySize}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${STATUS_COLORS[r.status]}20`, color: STATUS_COLORS[r.status] }}>
                      {STATUS_LABELS[r.status]}
                    </span>
                    {bookWrite && (NEXT_ACTIONS[r.status] ?? []).map((a) => (
                      a.status === "seated" && taken ? (
                        <button key={a.status} disabled title={`Table occupied${floor.until ? ` until ${floor.until}` : ""}`}
                          className="text-xs text-muted-foreground opacity-60 cursor-not-allowed">
                          {a.label}
                        </button>
                      ) : (
                        <button key={a.status} onClick={() => onStatus(r.id, a.status)} className="text-xs text-primary hover:underline">
                          {a.label}
                        </button>
                      )
                    ))}
                    {bookDelete && (
                      <button onClick={() => onRemove(r.id)} aria-label={`Delete booking for ${r.guestName}`} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {late && (
                  <div className="rounded-lg bg-muted/60 p-2 space-y-1.5">
                    <p className="text-xs text-foreground">
                      {r.guestName} is due, but {t.name} is occupied{floor.until ? ` until ${floor.until}` : ""}.
                    </p>
                    <MoveBooking booking={r} canMove={bookWrite} version={`${floor.label}|${floor.until}`} onMoved={onMoved} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
