import React from "react";
import { Link2 } from "lucide-react";
import { ArchivedBadge } from "@/components/reservations/CatalogParts";
import { FLOOR_DOT, type TableUnit } from "@/components/reservations/TableCard";
import { seatsLabel, tileStatus } from "@/components/reservations/reservationUi";

/** One table (or merged unit) on the floor map. The state is a colour bar plus
 *  a text line, so it never relies on colour alone. Opens the table's card. */
export default function FloorTile({ unit, onOpen }: { unit: TableUnit; onOpen: () => void }) {
  const { table: t, merge, bookings, floor } = unit;
  const name = merge ? merge.tableNames.join(" ＋ ") : t.name;
  const seats = merge ? `${merge.combinedCapacity} (merged)` : seatsLabel(t.capacity, t.maxExtraCapacity);
  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      style={{ borderLeftColor: FLOOR_DOT[floor.state] }}
      className={`text-left flex flex-col gap-0.5 rounded-lg border border-border border-l-4 bg-card p-2.5 min-h-[4.75rem] max-sm:min-h-11 hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${t.archivedAt ? "opacity-70" : ""}`}
    >
      <span className="text-sm font-medium text-foreground flex items-center gap-1 min-w-0">
        {merge && <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />}
        <span className="truncate" title={name}>{name}</span>
      </span>
      <span className="text-xs text-muted-foreground">seats {seats}</span>
      <span className="text-xs text-foreground flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: FLOOR_DOT[floor.state] }} />
        {tileStatus(floor)}
      </span>
      <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        {bookings.length === 0 ? "No bookings" : `${bookings.length} ${bookings.length === 1 ? "booking" : "bookings"}`}
        {t.archivedAt && <ArchivedBadge />}
      </span>
    </button>
  );
}
