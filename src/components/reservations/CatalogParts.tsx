import React from "react";
import { Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";

export type CatalogKind = "location" | "area" | "table";

// Edit/delete icons: a 44px tap area on phones, tight from sm up.
export const ICON_BTN = "inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded max-sm:w-11 max-sm:h-11 sm:p-1.5";

export const ArchivedBadge = () => <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">Archived</span>;

/** Edit / Archive on an active row; Restore / Delete permanently (never-used rows only) on an archived one. */
export function CatalogRowActions({ label, item, canWrite, canDelete, onEdit, onArchive, onRestore, onPurge }: {
  label: string; item: { archivedAt: string | null; hasHistory: boolean }; canWrite: boolean; canDelete: boolean;
  onEdit: () => void; onArchive: () => void; onRestore: () => void; onPurge: () => void;
}) {
  if (!canWrite) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      {item.archivedAt ? (
        <>
          <button onClick={onRestore} aria-label={`Restore ${label}`} title="Restore" className={ICON_BTN}><ArchiveRestore className="w-3.5 h-3.5" /></button>
          {canDelete && !item.hasHistory && (
            <button onClick={onPurge} aria-label={`Delete ${label} permanently`} title="Delete permanently" className={`${ICON_BTN} hover:text-destructive`}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </>
      ) : (
        <>
          <button onClick={onEdit} aria-label={`Edit ${label}`} className={ICON_BTN}><Pencil className="w-3.5 h-3.5" /></button>
          {canDelete && (
            <button onClick={onArchive} aria-label={`Archive ${label}`} title="Archive" className={`${ICON_BTN} hover:text-destructive`}><Archive className="w-3.5 h-3.5" /></button>
          )}
        </>
      )}
    </div>
  );
}
