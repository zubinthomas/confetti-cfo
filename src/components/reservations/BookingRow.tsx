import React from "react";
import { Trash2 } from "lucide-react";
import type { Reservation, ReservationStatus } from "@/api/reservationsApi";
import MoveBooking from "@/components/reservations/MoveBooking";
import type { TableUnit } from "@/components/reservations/TableCard";
import { STATUS_COLORS, STATUS_LABELS, NEXT_ACTIONS, endTime, isLateBooking } from "@/components/reservations/reservationUi";

/** One booking on the day view: time, guest, status and its actions. Shared by
 *  the table dialog / card and the List layout. A party that is due while
 *  someone else is on the table can't be seated there, and is offered a move.
 *  `showWhere` adds the table and area in front of the guest (the List layout,
 *  where rows aren't under a table heading). */
export default function BookingRow({ booking: r, unit, showWhere = false, bookWrite, bookDelete, nowMin, onStatus, onRemove, onMoved }: {
  booking: Reservation;
  unit: TableUnit;
  showWhere?: boolean;
  bookWrite: boolean;
  bookDelete: boolean;
  nowMin: number;
  onStatus: (id: string, status: ReservationStatus) => void;
  onRemove: (id: string) => void;
  onMoved: () => void;
}) {
  const { table: t, merge, floor } = unit;
  const tableName = merge ? merge.tableNames.join(" ＋ ") : t.name;
  // Someone other than this party is on the table: it can't be seated here.
  const taken = floor.state === "occupied" && floor.seatedBooking?.id !== r.id;
  const late = taken && bookWrite && isLateBooking(r, nowMin);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm flex-wrap">
        <div className="min-w-0">
          <span className="font-medium text-foreground">{r.time}–{endTime(r.time, r.durationMinutes)}</span>{" "}
          <span className="text-muted-foreground">
            {showWhere && <>· <span className="text-foreground">{tableName}</span> ({r.areaName}) </>}
            · {r.guestName} · party of {r.partySize}
          </span>
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
            {r.guestName} is due, but {tableName} is occupied{floor.until ? ` until ${floor.until}` : ""}.
          </p>
          <MoveBooking booking={r} canMove={bookWrite} version={`${floor.label}|${floor.until}`} onMoved={onMoved} />
        </div>
      )}
    </div>
  );
}
