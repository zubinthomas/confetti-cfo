import React from "react";
import type { ReservationTable } from "@/api/reservationsApi";
import { ArchivedBadge, CatalogRowActions } from "@/components/reservations/CatalogParts";
import { seatsLabel } from "@/components/reservations/reservationUi";

/** One table in the Locations & Tables grid. Merge rules are not shown here,
 *  they live in the edit form. */
export default function TableTile({ table, canWrite, canDelete, onEdit, onArchive, onRestore, onPurge }: {
  table: ReservationTable; canWrite: boolean; canDelete: boolean;
  onEdit: () => void; onArchive: () => void; onRestore: () => void; onPurge: () => void;
}) {
  return (
    <div className={`flex flex-col justify-between gap-1 rounded-lg border border-border bg-card p-2.5 min-h-[4.5rem] ${table.archivedAt ? "opacity-60" : ""}`}>
      <span className="text-sm font-medium text-foreground truncate" title={table.name}>{table.name}</span>
      <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
        <span className="text-xs text-muted-foreground">seats {seatsLabel(table.capacity, table.maxExtraCapacity)}</span>
        {table.type && <span className="text-xs px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">{table.type}</span>}
        {table.archivedAt && <ArchivedBadge />}
        <div className="ml-auto">
          <CatalogRowActions
            label={`table ${table.name}`} item={table} canWrite={canWrite} canDelete={canDelete}
            onEdit={onEdit} onArchive={onArchive} onRestore={onRestore} onPurge={onPurge}
          />
        </div>
      </div>
    </div>
  );
}
