import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  listSignInPage, type GuestSignIn, type GuestVisitType,
} from "@/api/guestSignInsApi";
import {
  type ReservationArea, type ReservationLocation, type ReservationTable,
} from "@/api/reservationsApi";
import AreaSelect from "@/components/reservations/AreaSelect";
import SignInRow, { VISIT_LABELS } from "@/components/reservations/SignInRow";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const PAGE_SIZE = 25;
const FIELD = "text-sm border border-border rounded-lg px-2 py-1.5 max-sm:min-h-11 bg-background text-foreground";
const noop = () => {};

/** Flat, filterable list of every signed-out register entry (the "All" side of
 *  the Day / All switch on the Signed out card). Filtering and paging happen on
 *  the server. `areas` and `tables` include archived ones, so entries that sat
 *  at a retired table can still be found. */
export default function AllSignIns({ locations, areas, tables, canWrite, canDelete, refreshKey, onError, onEdit, onDelete }: {
  locations: ReservationLocation[]; areas: ReservationArea[]; tables: ReservationTable[];
  canWrite: boolean; canDelete: boolean; refreshKey: number; onError: (message: string) => void;
  onEdit: (s: GuestSignIn) => void; onDelete: (s: GuestSignIn) => void;
}) {
  const [search, setSearch] = useState("");
  const [areaId, setAreaId] = useState("");
  const [tableId, setTableId] = useState("");
  const [visitType, setVisitType] = useState<GuestVisitType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ rows: GuestSignIn[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const q = useDebouncedValue(search.trim(), 300);
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);
  const tableOptions = useMemo(
    () => tables
      .filter((t) => !areaId || t.areaId === areaId)
      .map((t) => ({ id: t.id, label: `${areaName.get(t.areaId) ?? ""} / ${t.name}${t.archivedAt ? " (archived)" : ""}` }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [tables, areaId, areaName],
  );

  // Any filter change goes back to the first page.
  useEffect(() => { setOffset(0); }, [q, areaId, tableId, visitType, from, to]);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    listSignInPage({ from, to, areaId, tableId, visitType, q, state: "signedOut", limit: PAGE_SIZE, offset })
      .then((p) => {
        if (stale) return;
        // A delete can empty the last page: step back rather than show "no matches".
        if (p.rows.length === 0 && p.total > 0 && offset > 0) setOffset(Math.max(0, (Math.ceil(p.total / PAGE_SIZE) - 1) * PAGE_SIZE));
        else { setPage(p); onError(""); }
      })
      .catch((err) => { if (!stale) onError(err instanceof Error ? err.message : "Failed to load the register"); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, areaId, tableId, visitType, from, to, offset, refreshKey]);

  const total = page?.total ?? 0;
  const rows = page?.rows ?? [];
  const filtered = !!q || !!areaId || !!tableId || !!visitType || !!from || !!to;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative grow sm:grow-0 sm:w-56">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Guest, phone, host or table"
            aria-label="Search the register" className={`${FIELD} pl-8 w-full`}
          />
        </div>
        <AreaSelect
          value={areaId} onChange={(id) => { setAreaId(id); setTableId(""); }} locations={locations} areas={areas}
          allowNone className={FIELD}
        />
        <select value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label="Table" className={`${FIELD} max-w-[14rem]`}>
          <option value="">Any table</option>
          {tableOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={visitType} onChange={(e) => setVisitType(e.target.value as GuestVisitType | "")} aria-label="Visit type" className={FIELD}>
          <option value="">Any type</option>
          {(Object.keys(VISIT_LABELS) as GuestVisitType[]).map((v) => <option key={v} value={v}>{VISIT_LABELS[v]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD} />
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="text-xs text-primary hover:underline max-sm:min-h-11">Clear dates</button>
        )}
      </div>

      {page === null ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {filtered ? "No register entries match." : "No one has signed out yet."}
        </p>
      ) : (
        <div className={`space-y-2 ${loading ? "opacity-60" : ""}`}>
          {rows.map((s) => (
            <SignInRow
              key={s.id} s={s} showDate canWrite={canWrite} canDelete={canDelete}
              onAssign={noop} onSignOut={noop} onExtend={noop}
              onEdit={() => onEdit(s)} onDelete={() => onDelete(s)}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="px-3 py-1.5 max-sm:min-h-11 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}
              className="px-3 py-1.5 max-sm:min-h-11 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
