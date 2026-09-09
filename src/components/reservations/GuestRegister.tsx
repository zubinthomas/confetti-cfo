import React, { useState, useEffect, useMemo } from "react";
import { Plus, X, Loader2, Trash2, Pencil, LogOut, Armchair, Clock } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import FormField from "@/components/hr/FormField";
import ConfirmDialog from "@/components/ConfirmDialog";
import ReservationRescheduleModal from "@/components/reservations/ReservationRescheduleModal";
import { ApiError } from "@/api/http";
import {
  listSignIns, createSignIn, updateSignIn, assignTable, extendSignIn, signOutGuest, deleteSignIn,
  type GuestSignIn, type GuestVisitType,
} from "@/api/guestSignInsApi";
import {
  listReservations, listTableMerges, createTableMerge, canMergeTables,
  type Reservation, type ReservationLocation, type ReservationTable, type TableMerge, type MergeKind,
} from "@/api/reservationsApi";
import { istDateStr, istTimeStr, istClock, istTimeToUtcIso } from "@/lib/ist";

const todayStr = () => istDateStr();
const clockOf = istClock;
const nowTimeValue = () => istTimeStr();
const isoFromTimeToday = (hhmm: string) => istTimeToUtcIso(hhmm);

const VISIT_LABELS: Record<GuestVisitType, string> = { walk_in: "Walk-in", event: "Event" };
const VISIT_COLORS: Record<GuestVisitType, string> = { walk_in: "#3b82f6", event: "#8b5cf6" };
const EXTEND_STEPS = [15, 30, 60];
const MERGE_KIND_LABELS: Record<MergeKind, string> = { adjacent: "Side by side", end_to_end: "End to end" };
const END_TO_END_SEAT_LOSS = 2;

const seatCap = (t: ReservationTable) => t.capacity + t.maxExtraCapacity;
const suggestCombined = (ts: ReservationTable[], kind: MergeKind) => {
  const sum = ts.reduce((n, t) => n + seatCap(t), 0);
  return kind === "end_to_end" ? Math.max(1, sum - END_TO_END_SEAT_LOSS) : sum;
};

// ── Sign-in create / edit ────────────────────────────────────────────────

const EMPTY = {
  visitType: "walk_in" as GuestVisitType,
  reservationId: "",
  guestName: "", guestPhone: "", guestEmail: "",
  partySize: "2", locationId: "", purpose: "", host: "", notes: "",
  timeIn: nowTimeValue(),
};

function SignInModal({
  locations, existing, onClose, onSaved,
}: {
  locations: ReservationLocation[];
  existing: GuestSignIn | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => existing ? {
    ...EMPTY,
    visitType: existing.visitType,
    guestName: existing.guestName,
    guestPhone: existing.guestPhone ?? "",
    guestEmail: existing.guestEmail ?? "",
    partySize: String(existing.partySize),
    locationId: existing.locationId ?? "",
    purpose: existing.purpose ?? "",
    host: existing.host ?? "",
    notes: existing.notes ?? "",
  } : { ...EMPTY, locationId: locations[0]?.id ?? "" });
  const [todaysBookings, setTodaysBookings] = useState<Reservation[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  useEffect(() => {
    if (existing) return;
    listReservations({ date: todayStr() })
      .then((rs) => setTodaysBookings(rs.filter((r) => ["pending", "confirmed"].includes(r.status))))
      .catch(() => setTodaysBookings([]));
  }, [existing]);

  const linkBooking = (id: string) => {
    const b = todaysBookings.find((r) => r.id === id);
    setForm((f) => ({
      ...f,
      reservationId: id,
      ...(b ? {
        guestName: b.guestName,
        guestPhone: b.guestPhone ?? f.guestPhone,
        partySize: String(b.partySize),
        locationId: b.locationId,
      } : {}),
    }));
  };

  const save = async () => {
    setError("");
    if (!form.guestName.trim()) { setError("Guest name is required"); return; }
    const partySize = Number(form.partySize);
    if (!partySize || partySize <= 0) { setError("Enter a valid party size"); return; }
    setSaving(true);
    try {
      if (existing) {
        await updateSignIn(existing.id, {
          visitType: form.visitType,
          guestName: form.guestName.trim(),
          guestPhone: form.guestPhone.trim() || undefined,
          guestEmail: form.guestEmail.trim() || undefined,
          partySize,
          locationId: form.locationId || null,
          purpose: form.purpose.trim() || undefined,
          host: form.host.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
      } else {
        await createSignIn({
          visitType: form.visitType,
          reservationId: form.reservationId || undefined,
          guestName: form.guestName.trim(),
          guestPhone: form.guestPhone.trim() || undefined,
          guestEmail: form.guestEmail.trim() || undefined,
          partySize,
          locationId: form.locationId || undefined,
          purpose: form.purpose.trim() || undefined,
          host: form.host.trim() || undefined,
          notes: form.notes.trim() || undefined,
          signedInAt: form.timeIn !== nowTimeValue() ? isoFromTimeToday(form.timeIn) : undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{existing ? "Edit Sign-In" : "Sign In Guest"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Visit type</label>
            <select
              value={form.visitType} onChange={(e) => update("visitType", e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              {(Object.keys(VISIT_LABELS) as GuestVisitType[]).map((v) => (
                <option key={v} value={v}>{VISIT_LABELS[v]}</option>
              ))}
            </select>
          </div>
          {!existing && todaysBookings.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Link a booking</label>
              <select
                value={form.reservationId} onChange={(e) => linkBooking(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
              >
                <option value="">None</option>
                {todaysBookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.time} · {b.guestName} · party {b.partySize} · {b.tableName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <FormField label="Guest Name *" name="guestName" value={form.guestName} onChange={update} />
          <FormField label="Party Size *" name="partySize" type="number" value={form.partySize} onChange={update} />
          <FormField label="Guest Phone" name="guestPhone" value={form.guestPhone} onChange={update} />
          <FormField label="Guest Email" name="guestEmail" value={form.guestEmail} onChange={update} />
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Area</label>
            <select
              value={form.locationId} onChange={(e) => update("locationId", e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {!existing && (
            <FormField label="Time in" name="timeIn" type="time" value={form.timeIn} onChange={update} />
          )}
          <FormField label="Here to see (host)" name="host" value={form.host} onChange={update} />
          <div className="sm:col-span-2"><FormField label="Purpose" name="purpose" value={form.purpose} onChange={update} /></div>
          <div className="sm:col-span-2"><FormField label="Notes" name="notes" value={form.notes} onChange={update} /></div>
        </div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {existing ? "Save" : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign / change table ────────────────────────────────────────────────

function AssignTableModal({
  signIn, tables, merges, occupiedTableIds, onClose, onSaved,
}: {
  signIn: GuestSignIn;
  tables: ReservationTable[];
  merges: TableMerge[];
  occupiedTableIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mergedTableIds = useMemo(() => new Set(merges.flatMap((m) => m.tableIds)), [merges]);
  const areaTables = (signIn.locationId ? tables.filter((t) => t.locationId === signIn.locationId) : tables)
    .filter((t) => !mergedTableIds.has(t.id) || t.id === signIn.tableId);
  const [tableId, setTableId] = useState(signIn.tableId ?? areaTables[0]?.id ?? "");
  const [until, setUntil] = useState(() => signIn.expectedUntil ? clockOf(signIn.expectedUntil) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [branch, setBranch] = useState<null | { code: string; detail: Record<string, unknown>; message: string }>(null);
  const [clashBooking, setClashBooking] = useState<Reservation | null>(null);

  // Merge panel (opened from the over_capacity branch)
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeKind, setMergeKind] = useState<MergeKind>("adjacent");
  const [mergeWithIds, setMergeWithIds] = useState<string[]>([]);
  // `combined` follows the live suggestion until the host types their own number.
  const [combinedOverride, setCombinedOverride] = useState<string | null>(null);
  const baseTable = tables.find((t) => t.id === tableId);
  const mergeTables = [baseTable, ...mergeWithIds.map((id) => tables.find((t) => t.id === id))]
    .filter((t): t is ReservationTable => !!t);
  const suggestion = suggestCombined(mergeTables, mergeKind);
  const combined = combinedOverride ?? String(suggestion);
  const toggleMergeWith = (id: string) => setMergeWithIds((cur) =>
    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  const submit = async (acknowledgeMerge = false) => {
    setError(""); setBranch(null);
    if (!tableId) { setError("Pick a table"); return; }
    setSaving(true);
    try {
      await assignTable(signIn.id, {
        tableId,
        expectedUntil: until ? isoFromTimeToday(until) : undefined,
        acknowledgeMerge,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data && typeof err.data === "object") {
        const d = err.data as { code: string; detail?: Record<string, unknown>; message: string };
        setBranch({ code: d.code, detail: d.detail ?? {}, message: d.message });
        if (d.code === "reservation_clash" && d.detail?.reservationId) {
          const rs = await listReservations({ date: todayStr() }).catch(() => [] as Reservation[]);
          setClashBooking(rs.find((r) => r.id === d.detail?.reservationId) ?? null);
        }
      } else {
        setError(err instanceof Error ? err.message : "Failed to assign table");
      }
    } finally {
      setSaving(false);
    }
  };

  const mergeAndSeat = async () => {
    setError("");
    if (mergeWithIds.length === 0) { setError("Pick at least one table to join"); return; }
    const capacity = Number(combined) || suggestion;
    setSaving(true);
    try {
      await createTableMerge({
        tableIds: [tableId, ...mergeWithIds], mergeKind, combinedCapacity: capacity,
      });
      setMergeOpen(false); setMergeWithIds([]); setCombinedOverride(null); setBranch(null);
      await submit(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge tables");
      setSaving(false);
    }
  };

  const unseat = async () => {
    setSaving(true);
    try { await assignTable(signIn.id, { tableId: null }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  const selectedTables = mergeWithIds
    .map((id) => tables.find((t) => t.id === id))
    .filter((t): t is ReservationTable => !!t);

  // A table is a merge candidate only if it's set up to merge with the base
  // table AND with every table already picked (an N-way merge needs every pair
  // eligible, matching the server check). Because the list only ever offers
  // tables compatible with the whole current selection, the checked set can't
  // drift out of sync - and `tableId` changes already clear it (see the table
  // <select> above).
  const mergeCandidates = areaTables.filter((t) => {
    if (t.id === tableId || mergedTableIds.has(t.id) || occupiedTableIds.has(t.id)) return false;
    if (!baseTable || !canMergeTables(baseTable, t)) return false;
    return selectedTables.every((s) => s.id === t.id || canMergeTables(s, t));
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Seat {signIn.guestName}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">Party of {signIn.partySize}{signIn.locationName ? ` · ${signIn.locationName}` : ""}</p>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Table</label>
            <select
              value={tableId} onChange={(e) => { setTableId(e.target.value); setMergeWithIds([]); }}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              {areaTables.length === 0 && <option value="">No tables in this area</option>}
              {areaTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (seats {t.capacity}{t.maxExtraCapacity ? ` +${t.maxExtraCapacity}` : ""})
                </option>
              ))}
            </select>
          </div>
          <FormField label="Expected until" name="until" type="time" value={until} onChange={(_n, v) => setUntil(v)} />

          {branch?.code === "merge_prompt" && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-2">
              <p>{branch.message}</p>
              <button onClick={() => submit(true)} disabled={saving}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:opacity-90 disabled:opacity-50">
                Seat them together
              </button>
            </div>
          )}
          {branch?.code === "over_capacity" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
              <p>{branch.message}</p>
              {branch.detail?.alreadyMerged ? (
                <p className="opacity-80">Too big even for the joined tables — split the party across areas or reduce it.</p>
              ) : Number(branch.detail?.occupants ?? 0) > 0 ? (
                <p className="opacity-80">Another party is seated here. Pick an empty table, or reduce the party.</p>
              ) : mergeCandidates.length === 0 ? (
                <p className="opacity-80">No tables here are set up to merge with this one. Set merge targets in Locations and Tables, or reduce the party.</p>
              ) : !mergeOpen ? (
                <button onClick={() => setMergeOpen(true)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md bg-destructive text-white hover:opacity-90">
                  Join with another table
                </button>
              ) : null}
            </div>
          )}

          {mergeOpen && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3 text-xs">
              <p className="font-medium text-foreground">Join {baseTable?.name ?? "this table"} with:</p>
              <div className="space-y-1">
                {mergeCandidates.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked={mergeWithIds.includes(t.id)} onChange={() => toggleMergeWith(t.id)} />
                    {t.name} (seats {seatCap(t)})
                  </label>
                ))}
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">How the tables sit</span>
                <div className="flex gap-2">
                  {(Object.keys(MERGE_KIND_LABELS) as MergeKind[]).map((k) => (
                    <button key={k} type="button"
                      onClick={() => setMergeKind(k)}
                      className={`px-2 py-1 rounded border ${mergeKind === k ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                      {MERGE_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <FormField label={`Seats once joined (suggested ${suggestion})`} name="combined" type="number"
                value={combined} onChange={(_n, v) => setCombinedOverride(v)} />
              <button onClick={mergeAndSeat} disabled={saving || mergeWithIds.length === 0}
                className="w-full text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Merge &amp; seat
              </button>
            </div>
          )}

          {branch?.code === "reservation_clash" && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-2">
              <p>{branch.message}</p>
              {clashBooking
                ? <button onClick={() => { /* open reschedule */ setBranch({ ...branch, code: "reschedule" }); }}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:opacity-90">
                    Reschedule that booking
                  </button>
                : <p className="opacity-80">Open the Reservations tab to move it.</p>}
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="px-6 pb-6 flex justify-between gap-3">
          {signIn.tableId
            ? <button onClick={unseat} disabled={saving} className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Unseat</button>
            : <span />}
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={() => submit(false)} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Seat
            </button>
          </div>
        </div>
      </div>

      {branch?.code === "reschedule" && clashBooking && (
        <ReservationRescheduleModal
          reservation={clashBooking}
          title="Reschedule the clashing booking"
          onClose={() => setBranch({ ...branch, code: "reservation_clash" })}
          onSaved={() => { setBranch(null); setClashBooking(null); submit(false); }}
        />
      )}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────

function SignInRow({
  s, canWrite, canDelete, onAssign, onEdit, onSignOut, onDelete, onExtend,
}: {
  s: GuestSignIn;
  canWrite: boolean; canDelete: boolean;
  onAssign: () => void; onEdit: () => void; onSignOut: () => void; onDelete: () => void;
  onExtend: (minutes: number) => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const out = s.signedOutAt;
  return (
    <div className="border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{s.guestName}</span>
          <span className="text-muted-foreground">party of {s.partySize}</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${VISIT_COLORS[s.visitType]}20`, color: VISIT_COLORS[s.visitType] }}>
            {VISIT_LABELS[s.visitType]}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {s.locationName ?? "—"} · {s.tableName ? <span className="text-foreground">{s.tableName}</span> : "unseated"}
          {" · in "}{clockOf(s.signedInAt)}
          {out && ` – ${clockOf(out)} out`}
          {!out && s.expectedUntil && s.tableId && ` · until ~${clockOf(s.expectedUntil)}`}
        </div>
        {(s.host || s.purpose) && (
          <div className="text-xs text-muted-foreground">
            {s.host && <>Host: {s.host}</>}{s.host && s.purpose && " · "}{s.purpose}
          </div>
        )}
        {s.reservationId && (
          <div className="text-xs text-primary">↳ booking {s.reservationTime ?? ""} ({s.reservationGuestName ?? ""})</div>
        )}
      </div>
      {canWrite && !out && (
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <button onClick={onAssign} className="flex items-center gap-1 text-primary hover:underline">
            <Armchair className="w-3.5 h-3.5" /> {s.tableId ? "Change table" : "Assign table"}
          </button>
          {s.tableId && (
            <div className="relative">
              <button onClick={() => setExtendOpen((v) => !v)} className="flex items-center gap-1 text-primary hover:underline">
                <Clock className="w-3.5 h-3.5" /> Extend
              </button>
              {extendOpen && (
                <div className="absolute right-0 mt-1 z-10 bg-card border border-border rounded-lg p-1 flex gap-1 shadow-md">
                  {EXTEND_STEPS.map((m) => (
                    <button key={m} onClick={() => { setExtendOpen(false); onExtend(m); }}
                      className="text-xs px-2 py-1 rounded hover:bg-muted">+{m}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={onSignOut} className="flex items-center gap-1 text-primary hover:underline">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
          {canDelete && (
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )}
      {canWrite && out && (
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
          {canDelete && (
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function GuestRegister({
  locations, tables, canWrite, canDelete,
}: {
  locations: ReservationLocation[];
  tables: ReservationTable[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [onPremises, setOnPremises] = useState<GuestSignIn[] | null>(null);
  const [dayHistory, setDayHistory] = useState<GuestSignIn[] | null>(null);
  const [merges, setMerges] = useState<TableMerge[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [error, setError] = useState("");

  const [showSignIn, setShowSignIn] = useState(false);
  const [editTarget, setEditTarget] = useState<GuestSignIn | null>(null);
  const [assignTarget, setAssignTarget] = useState<GuestSignIn | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<GuestSignIn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GuestSignIn | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError("");
    try {
      const [live, day, ms] = await Promise.all([
        listSignIns({ onPremisesOnly: true }),
        listSignIns({ date: selectedDate }),
        listTableMerges().catch(() => [] as TableMerge[]),
      ]);
      setOnPremises(live);
      setDayHistory(day);
      setMerges(ms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the register");
    }
  };

  useEffect(() => { load(); }, [selectedDate]);

  const signedOut = useMemo(
    () => (dayHistory ?? []).filter((s) => s.signedOutAt),
    [dayHistory],
  );
  const coversOnPremises = (onPremises ?? []).reduce((n, s) => n + s.partySize, 0);
  const seatedNow = (onPremises ?? []).filter((s) => s.tableId).length;

  // Tables with a walk-in sitting at them now, so the merge picker can skip
  // them. Seated *bookings* aren't in this list (the register doesn't load
  // reservations) but the server re-checks occupancy on merge-and-seat.
  const occupiedTableIds = useMemo(
    () => new Set((onPremises ?? []).filter((s) => s.tableId).map((s) => s.tableId as string)),
    [onPremises],
  );

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError("");
    try { await fn(); await load(); return true; }
    catch (err) { setActionError(err instanceof Error ? err.message : "Action failed"); return false; }
  };

  const doExtend = (s: GuestSignIn, minutes: number) =>
    runAction(() => extendSignIn(s.id, minutes));

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="On premises now" value={onPremises?.length ?? "—"} />
        <KpiCard label="Covers on premises" value={coversOnPremises} />
        <KpiCard label="Seated now" value={seatedNow} />
        <KpiCard label="Guests today" value={dayHistory?.length ?? "—"} />
      </div>

      <DashCard
        title="On premises now"
        action={canWrite && (
          <button
            onClick={() => setShowSignIn(true)}
            disabled={locations.length === 0}
            className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Sign In Guest
          </button>
        )}
      >
        {onPremises === null ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : onPremises.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No guests signed in right now.</p>
        ) : (
          <div className="space-y-2">
            {onPremises.map((s) => (
              <SignInRow
                key={s.id} s={s} canWrite={canWrite} canDelete={canDelete}
                onAssign={() => setAssignTarget(s)}
                onEdit={() => setEditTarget(s)}
                onSignOut={() => setSignOutTarget(s)}
                onDelete={() => setDeleteTarget(s)}
                onExtend={(m) => doExtend(s, m)}
              />
            ))}
          </div>
        )}
      </DashCard>

      <DashCard
        title="Signed out"
        action={(
          <input
            type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
          />
        )}
      >
        {dayHistory === null ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : signedOut.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No one has signed out on this date.</p>
        ) : (
          <div className="space-y-2">
            {signedOut.map((s) => (
              <SignInRow
                key={s.id} s={s} canWrite={canWrite} canDelete={canDelete}
                onAssign={() => setAssignTarget(s)}
                onEdit={() => setEditTarget(s)}
                onSignOut={() => setSignOutTarget(s)}
                onDelete={() => setDeleteTarget(s)}
                onExtend={() => {}}
              />
            ))}
          </div>
        )}
      </DashCard>

      {(showSignIn || editTarget) && (
        <SignInModal
          locations={locations}
          existing={editTarget}
          onClose={() => { setShowSignIn(false); setEditTarget(null); }}
          onSaved={() => { setShowSignIn(false); setEditTarget(null); load(); }}
        />
      )}
      {assignTarget && (
        <AssignTableModal
          signIn={assignTarget}
          tables={tables}
          merges={merges}
          occupiedTableIds={occupiedTableIds}
          onClose={() => setAssignTarget(null)}
          onSaved={() => { setAssignTarget(null); load(); }}
        />
      )}
      <ConfirmDialog
        open={signOutTarget !== null}
        onOpenChange={(open) => { if (!open) { setSignOutTarget(null); setActionError(""); } }}
        title="Sign this guest out?"
        description={actionError || (signOutTarget
          ? `${signOutTarget.guestName} — party of ${signOutTarget.partySize}. Their table is released.`
          : "")}
        confirmLabel="Sign out"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const done = await runAction(() => signOutGuest(signOutTarget!.id));
          setBusy(false);
          if (done) setSignOutTarget(null);
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setActionError(""); } }}
        title="Delete this register entry?"
        description={actionError || (deleteTarget ? `${deleteTarget.guestName}'s sign-in will be permanently removed.` : "")}
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const done = await runAction(() => deleteSignIn(deleteTarget!.id));
          setBusy(false);
          if (done) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
