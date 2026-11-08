import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { areaLabel, type ReservationArea, type ReservationLocation, type ReservationStatus, type TableMerge } from "@/api/reservationsApi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FloorTile from "@/components/reservations/FloorTile";
import TableCard, { FLOOR_DOT, type TableUnit } from "@/components/reservations/TableCard";
import BookingRow from "@/components/reservations/BookingRow";
import { bookingRows, floorSummary, type FloorInfo } from "@/components/reservations/reservationUi";
import type { GuestSignIn } from "@/api/guestSignInsApi";

export type DayLayout = "grid" | "list";
export const isDayLayout = (v: unknown): v is DayLayout => v === "grid" || v === "list";

const PILL = "text-sm px-3 py-1.5 max-sm:min-h-11 rounded-lg";
// Two tiles across on a phone, wider tiles from sm up.
const GRID = "grid gap-2 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]";
const LEGEND: [FloorInfo["state"], string][] = [["free", "Free"], ["reserved", "Next booking"], ["late", "Late"], ["occupied", "Occupied"]];

/** Grid | List switch and Collapse all / Expand all, for the card header. */
export function DayFloorControls({ layout, onLayout, everyAreaCollapsed, onToggleAll }: {
  layout: DayLayout; onLayout: (l: DayLayout) => void;
  /** Null hides the collapse button (nothing to collapse). */
  everyAreaCollapsed: boolean | null; onToggleAll: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5" role="group" aria-label="Table layout">
        {([["grid", "Grid"], ["list", "List"]] as const).map(([id, label]) => (
          <button
            key={id} onClick={() => onLayout(id)} aria-pressed={layout === id}
            className={`${PILL} ${layout === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {everyAreaCollapsed !== null && (
        <button onClick={onToggleAll} className={`${PILL} border border-border text-muted-foreground hover:bg-muted`}>
          {everyAreaCollapsed ? "Expand all" : "Collapse all"}
        </button>
      )}
    </>
  );
}

/** The day view body: one collapsible section per area, its tables as floor-map
 *  tiles (Grid) or full cards (List). A tile opens the same card in a dialog. */
export default function DayFloor({
  areas, locations, units, layout, collapsed, onToggleArea,
  bookWrite, bookDelete, mergeWrite, floorWritable,
  regWrite, regDelete,
  onSplit, onExtend, onFree, onDismissAlert, onStatus, onRemove, onMoved, nowMin,
  onExtendGuest, onSignOutGuest, onEditGuest, onAssignGuest, onDeleteGuest,
  detailDialogSuspended,
}: {
  areas: ReservationArea[];
  locations: ReservationLocation[];
  /** One entry per table, or per merged unit (at its first table). */
  units: TableUnit[];
  layout: DayLayout;
  collapsed: string[];
  onToggleArea: (areaId: string) => void;
  bookWrite: boolean; bookDelete: boolean; mergeWrite: boolean;
  floorWritable: (floor: FloorInfo) => boolean;
  /** GuestRegister:write/delete, for each tile's per-guest walk-in rows. */
  regWrite: boolean; regDelete: boolean;
  onSplit: (merge: TableMerge) => void;
  onExtend: (floor: FloorInfo, minutes: number) => void;
  onFree: (unit: TableUnit) => void;
  onDismissAlert: (unit: TableUnit) => void;
  onStatus: (id: string, status: ReservationStatus) => void;
  onRemove: (id: string) => void;
  /** A booking was moved to another table: reload the floor. */
  onMoved: () => void;
  /** Minutes past midnight in IST, so a card can tell which bookings are running now. */
  nowMin: number;
  onExtendGuest: (id: string, minutes: number) => void;
  onSignOutGuest: (guest: GuestSignIn) => void;
  onEditGuest: (guest: GuestSignIn) => void;
  onAssignGuest: (guest: GuestSignIn) => void;
  onDeleteGuest: (guest: GuestSignIn) => void;
  /** A child modal the caller opened from inside our table dialog (edit/sign-out/
   *  delete) is up - suspend our own dialog instead of stacking a second overlay. */
  detailDialogSuspended: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Read live every render, so the dialog follows status changes and closes by
  // itself when its unit goes away (a merge that was split).
  const openUnit = openKey ? units.find((u) => u.key === openKey) ?? null : null;

  const cardProps = (unit: TableUnit, bordered: boolean) => ({
    unit, bordered, bookWrite, bookDelete, mergeWrite,
    floorWritable: floorWritable(unit.floor),
    regWrite, regDelete,
    onSplit: () => unit.merge && onSplit(unit.merge),
    onExtend: (m: number) => onExtend(unit.floor, m),
    onFree: () => onFree(unit),
    onDismissAlert: () => onDismissAlert(unit),
    onStatus, onRemove, onMoved, nowMin,
    onExtendGuest,
    onSignOutGuest: (id: string) => {
      const g = unit.floor.guests.find((x) => x.id === id);
      if (g) onSignOutGuest(g);
    },
    onEditGuest,
    // Assign leaves this dialog behind for the assign-table flow, unlike edit/
    // sign-out/delete which return here - so close our own local dialog state.
    onAssignGuest: (g: GuestSignIn) => { onAssignGuest(g); setOpenKey(null); },
    onDeleteGuest: (id: string) => {
      const g = unit.floor.guests.find((x) => x.id === id);
      if (g) onDeleteGuest(g);
    },
  });

  // List shows the day's bookings, not its tables.
  if (layout === "list") {
    const rows = bookingRows(units);
    if (rows.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-8">No reservations for this day.</p>;
    }
    return (
      <div className="space-y-2">
        {rows.map(({ booking, unit }) => (
          <div key={booking.id} className="border border-border rounded-lg p-3">
            <BookingRow
              booking={booking} unit={unit} showWhere
              bookWrite={bookWrite} bookDelete={bookDelete} nowMin={nowMin}
              onStatus={onStatus} onRemove={onRemove} onMoved={onMoved}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground" aria-label="Legend">
        {LEGEND.map(([state, label]) => (
          <span key={state} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOOR_DOT[state] }} /> {label}
          </span>
        ))}
      </div>
      {areas.map((area) => {
        const areaUnits = units.filter((u) => u.table.areaId === area.id);
        if (areaUnits.length === 0) return null;
        const locationName = locations.length > 1 ? locations.find((l) => l.id === area.locationId)?.name : null;
        const open = !collapsed.includes(area.id);
        const bodyId = `day-area-${area.id}`;
        return (
          <div key={area.id}>
            <button
              onClick={() => onToggleArea(area.id)} aria-expanded={open} aria-controls={bodyId}
              className="flex items-center gap-2 flex-wrap w-full text-left mb-2 max-sm:min-h-11"
            >
              <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
              <span className="text-sm font-semibold text-foreground">
                {locationName && <span className="text-muted-foreground font-normal">{locationName} · </span>}{areaLabel(area)}
              </span>
              <span className="text-xs text-muted-foreground">{floorSummary(areaUnits.map((u) => u.floor))}</span>
            </button>
            {open && (
              <div id={bodyId}>
                <div className={GRID}>
                  {areaUnits.map((u) => <FloorTile key={u.key} unit={u} onOpen={() => setOpenKey(u.key)} />)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Suspended (not closed) while an edit/sign-out/delete modal launched from
          inside it is up, so the two overlays never stack. */}
      <Dialog open={openUnit !== null && !detailDialogSuspended} onOpenChange={(o) => { if (!o) setOpenKey(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {openUnit && (
            <>
              <DialogHeader>
                <DialogTitle>{openUnit.merge ? openUnit.merge.tableNames.join(" ＋ ") : openUnit.table.name}</DialogTitle>
                <DialogDescription className="sr-only">Floor status and bookings for this table</DialogDescription>
              </DialogHeader>
              <TableCard {...cardProps(openUnit, false)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
