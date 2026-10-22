import React from "react";
import type { ReservationTable } from "@/api/reservationsApi";
import { ArchivedBadge } from "@/components/reservations/CatalogParts";
import { mergeSummary, seatsLabel, type MergeKind } from "@/components/reservations/reservationUi";

/** Left bar colour per merge setup. "none" keeps the plain border. */
export const MERGE_BAR: Record<MergeKind, string | undefined> = { free: "#3b82f6", linked: "#93c5fd", none: undefined };

const TILE = "flex flex-col gap-0.5 rounded-lg border border-border border-l-4 bg-card p-2.5 min-h-[4.75rem] max-sm:min-h-11 text-left";
const TEXT_BTN = "text-xs text-primary hover:underline max-sm:min-h-11 max-sm:px-1";

/** One table in the Locations & Tables grid. An active table is a button that
 *  opens its edit form (archive lives there); an archived one has no form, so it
 *  offers Restore and, if it was never used, Delete permanently. */
export default function TableTile({ table, canWrite, canDelete, onOpen, onRestore, onPurge }: {
  table: ReservationTable; canWrite: boolean; canDelete: boolean;
  onOpen: () => void; onRestore: () => void; onPurge: () => void;
}) {
  const merge = mergeSummary(table);
  const body = (
    <>
      <span className="text-sm font-medium text-foreground truncate" title={table.name}>{table.name}</span>
      <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        seats {seatsLabel(table.capacity, table.maxExtraCapacity)}
        {table.type && <span className="px-1.5 py-0.5 rounded-full border border-border">{table.type}</span>}
      </span>
      <span className="text-xs text-foreground flex items-center gap-1.5">
        {merge.kind !== "none" && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: MERGE_BAR[merge.kind] }} />}
        {merge.label}
      </span>
      {table.archivedAt && <span><ArchivedBadge /></span>}
    </>
  );
  const style = { borderLeftColor: MERGE_BAR[merge.kind] };

  if (table.archivedAt) {
    return (
      <div className={`${TILE} opacity-70`} style={style}>
        {body}
        {canWrite && (
          <div className="flex items-center gap-3 flex-wrap mt-auto pt-1">
            <button onClick={onRestore} aria-label={`Restore table ${table.name}`} className={TEXT_BTN}>Restore</button>
            {canDelete && !table.hasHistory && (
              <button onClick={onPurge} aria-label={`Delete table ${table.name} permanently`} className={`${TEXT_BTN} text-destructive`}>Delete permanently</button>
            )}
          </div>
        )}
      </div>
    );
  }
  if (!canWrite) return <div className={TILE} style={style}>{body}</div>;
  return (
    <button
      onClick={onOpen} aria-label={`Edit table ${table.name}`} style={style}
      className={`${TILE} hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
    </button>
  );
}
