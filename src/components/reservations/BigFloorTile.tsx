import React from "react";
import { Link2 } from "lucide-react";
import { FLOOR_DOT, type TableUnit } from "@/components/reservations/TableCard";
import { tileStatus } from "@/components/reservations/reservationUi";

/** A large, high-contrast table tile for the standalone Floor View page -
 *  same status color/label as the dense FloorTile, just bigger tap targets
 *  and name + status only (no bookings-count badge), for a glance-from-
 *  across-the-room read. */
export default function BigFloorTile({ unit, onOpen }: { unit: TableUnit; onOpen: () => void }) {
  const { table: t, merge, floor } = unit;
  const name = merge ? merge.tableNames.join(" ＋ ") : t.name;
  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      style={{ borderLeftColor: FLOOR_DOT[floor.state] }}
      className={`text-left flex flex-col gap-1.5 rounded-xl border border-border border-l-[6px] bg-card p-4 min-h-[6.5rem] hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${t.archivedAt ? "opacity-70" : ""}`}
    >
      <span className="text-lg font-semibold text-foreground flex items-center gap-1.5 min-w-0">
        {merge && <Link2 className="w-4 h-4 text-primary shrink-0" />}
        <span className="truncate" title={name}>{name}</span>
      </span>
      <span className="text-sm text-foreground flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: FLOOR_DOT[floor.state] }} />
        {tileStatus(floor)}
      </span>
    </button>
  );
}
