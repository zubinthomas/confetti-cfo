import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Trash2 } from "lucide-react";
import {
  listReservationPage, updateReservationStatus, deleteReservation, areaLabel,
  type Reservation, type ReservationArea, type ReservationLocation, type ReservationStatus,
} from "@/api/reservationsApi";
import AreaSelect from "@/components/reservations/AreaSelect";
import {
  STATUS_LABELS, STATUS_COLORS, NEXT_ACTIONS, endTime, scopeRange, type ListScope,
} from "@/components/reservations/reservationUi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { istDateStr } from "@/lib/ist";

const PAGE_SIZE = 25;
const FIELD = "text-sm border border-border rounded-lg px-2 py-1.5 max-sm:min-h-11 bg-background text-foreground";
const SCOPES: { id: ListScope; label: string }[] = [
  { id: "upcoming", label: "Upcoming" }, { id: "past", label: "Past" }, { id: "all", label: "All" },
];

const prettyDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Flat, filterable list of every reservation (the "All" side of the Day / All
 *  switch). Filtering and paging happen on the server. */
export default function AllReservations({ locations, areas, canWrite, canDelete, refreshKey, onError }: {
  locations: ReservationLocation[]; areas: ReservationArea[];
  canWrite: boolean; canDelete: boolean; refreshKey: number; onError: (message: string) => void;
}) {
  const [scope, setScope] = useState<ListScope>("upcoming");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReservationStatus | "">("");
  const [areaId, setAreaId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ rows: Reservation[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  const q = useDebouncedValue(search.trim(), 300);

  // Any filter change goes back to the first page.
  useEffect(() => { setOffset(0); }, [scope, q, status, areaId, from, to]);

  const today = istDateStr();
  useEffect(() => {
    let stale = false;
    const range = scopeRange(scope, today, from, to);
    setLoading(true);
    listReservationPage({ ...range, status, areaId, q, limit: PAGE_SIZE, offset })
      .then((p) => {
        if (stale) return;
        // A delete can empty the last page: step back rather than show "no matches".
        if (p.rows.length === 0 && p.total > 0 && offset > 0) setOffset(Math.max(0, (Math.ceil(p.total / PAGE_SIZE) - 1) * PAGE_SIZE));
        else { setPage(p); onError(""); }
      })
      .catch((err) => { if (!stale) onError(err instanceof Error ? err.message : "Failed to load reservations"); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q, status, areaId, from, to, offset, today, refreshKey, reload]);

  const run = useCallback(async (fn: () => Promise<unknown>, fallback: string) => {
    onError("");
    try { await fn(); setReload((n) => n + 1); } catch (err) { onError(err instanceof Error ? err.message : fallback); }
  }, [onError]);

  const total = page?.total ?? 0;
  const rows = page?.rows ?? [];
  const filtered = scope !== "upcoming" || !!q || !!status || !!areaId || !!from || !!to;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.id} onClick={() => setScope(s.id)}
              className={`text-sm px-3 py-1.5 max-sm:min-h-11 rounded-lg ${scope === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative grow sm:grow-0 sm:w-56">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Guest, phone or email"
            aria-label="Search reservations" className={`${FIELD} pl-8 w-full`}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as ReservationStatus | "")} aria-label="Status" className={FIELD}>
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABELS) as ReservationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <AreaSelect value={areaId} onChange={setAreaId} locations={locations} areas={areas} allowNone className={FIELD} />
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
          {filtered ? "No reservations match." : "No upcoming reservations."}
        </p>
      ) : (
        <div className={`divide-y divide-border border border-border rounded-lg ${loading ? "opacity-60" : ""}`}>
          {rows.map((r) => (
            <div key={r.id} className="p-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0 text-sm">
                <p>
                  <span className="font-medium text-foreground">{prettyDate(r.date)}</span>{" "}
                  <span className="text-foreground">{r.time}–{endTime(r.time, r.durationMinutes)}</span>
                </p>
                <p className="text-muted-foreground break-words">
                  {r.guestName} · party of {r.partySize}
                  {r.guestPhone ? ` · ${r.guestPhone}` : ""}
                </p>
                <p className="text-xs text-muted-foreground break-words">
                  {areaLabel({ name: r.areaName, floor: r.floor })} · {r.tableName}
                  {r.notes ? ` · ${r.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${STATUS_COLORS[r.status]}20`, color: STATUS_COLORS[r.status] }}>
                  {STATUS_LABELS[r.status]}
                </span>
                {canWrite && (NEXT_ACTIONS[r.status] ?? []).map((a) => (
                  <button
                    key={a.status} onClick={() => run(() => updateReservationStatus(r.id, a.status), "Failed to update reservation")}
                    className="text-xs text-primary hover:underline max-sm:min-h-11 max-sm:px-1"
                  >
                    {a.label}
                  </button>
                ))}
                {canDelete && (
                  <button
                    onClick={() => run(() => deleteReservation(r.id), "Failed to delete reservation")} aria-label={`Delete reservation for ${r.guestName}`}
                    className="inline-flex items-center justify-center text-muted-foreground hover:text-destructive max-sm:w-11 max-sm:h-11"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
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
