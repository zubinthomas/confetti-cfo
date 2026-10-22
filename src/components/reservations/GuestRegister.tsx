import React, { useState, useEffect, useMemo } from "react";
import AreaSelect from "@/components/reservations/AreaSelect";
import { Plus, X, Loader2, Trash2, Phone, ArrowUp, ArrowDown, AlertTriangle, Armchair } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import FormField from "@/components/hr/FormField";
import ConfirmDialog from "@/components/ConfirmDialog";
import SignInRow, { VISIT_LABELS } from "@/components/reservations/SignInRow";
import AllSignIns from "@/components/reservations/AllSignIns";
import ReservationRescheduleModal from "@/components/reservations/ReservationRescheduleModal";
import { ApiError } from "@/api/http";
import {
  listSignIns, createSignIn, updateSignIn, assignTable, extendSignIn, signOutGuest, deleteSignIn, estimateWait,
  notifyGuest, reorderSignIn,
  type GuestSignIn, type GuestVisitType,
} from "@/api/guestSignInsApi";
import {
  listReservations, listTableMerges, createTableMerge, canMergeTables,
  type Reservation, type ReservationLocation, type ReservationArea, type ReservationTable, type TableMerge, type MergeKind,
} from "@/api/reservationsApi";
import { checkWaitlistMatch } from "@/lib/waitlistMatch";
import { istDateStr, istTimeStr, istClock, istTimeToUtcIso } from "@/lib/ist";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

const todayStr = () => istDateStr();
const clockOf = istClock;
const nowTimeValue = () => istTimeStr();
const isoFromTimeToday = (hhmm: string) => istTimeToUtcIso(hhmm);

const MERGE_KIND_LABELS: Record<MergeKind, string> = { adjacent: "Side by side", end_to_end: "End to end" };
const END_TO_END_SEAT_LOSS = 2;

const seatCap = (t: ReservationTable) => t.capacity + t.maxExtraCapacity;
const suggestCombined = (ts: ReservationTable[], kind: MergeKind) => {
  const sum = ts.reduce((n, t) => n + seatCap(t), 0);
  return kind === "end_to_end" ? Math.max(1, sum - END_TO_END_SEAT_LOSS) : sum;
};

// A host stops seeing this as "the system still has it handled" after this
// long without a seat - an advisory flag only, staff still decide what to do.
const GRACE_MINUTES = 12;
const isAtRisk = (s: GuestSignIn) =>
  s.notifiedAt != null && (Date.now() - new Date(s.notifiedAt).getTime()) / 60_000 > GRACE_MINUTES;

function elapsed(iso: string): string {
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Sign-in create / edit ────────────────────────────────────────────────

const EMPTY = {
  visitType: "walk_in" as GuestVisitType,
  reservationId: "",
  guestName: "", guestPhone: "", guestEmail: "",
  partySize: "2", areaId: "", purpose: "", host: "", notes: "",
  timeIn: nowTimeValue(),
  quotedWaitMinutes: "",
};

export function SignInModal({
  locations, areas, existing, onClose, onSaved,
}: {
  locations: ReservationLocation[];
  areas: ReservationArea[];
  existing: GuestSignIn | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { draft, save: saveDraft, clear: clearDraft } = useDraftPersistence<typeof EMPTY>("guest-signin");
  const blankSignIn = () => ({ ...EMPTY, areaId: areas[0]?.id ?? "" });
  const [form, setForm] = useState(() => existing ? {
    ...EMPTY,
    visitType: existing.visitType,
    guestName: existing.guestName,
    guestPhone: existing.guestPhone ?? "",
    guestEmail: existing.guestEmail ?? "",
    partySize: String(existing.partySize),
    areaId: existing.areaId ?? "",
    purpose: existing.purpose ?? "",
    host: existing.host ?? "",
    notes: existing.notes ?? "",
  } : (draft ? { ...blankSignIn(), ...draft } : blankSignIn()));
  const [todaysBookings, setTodaysBookings] = useState<Reservation[]>([]);
  const [suggestedWait, setSuggestedWait] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  useEffect(() => {
    if (existing || !draft) return;
    toast({
      title: "Restored unsaved changes",
      description: "From your last session.",
      action: (
        <ToastAction onClick={() => { clearDraft(); setForm(blankSignIn()); }}>
          Discard
        </ToastAction>
      ),
    });
    // Only meant to fire once, for the draft this modal mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh sign-in (not editing an existing one) is the only case worth
  // drafting - persisting edits to an existing sign-in under the same key
  // would let a stale draft silently overwrite the next new sign-in's form.
  // Skip persisting a still-blank form too, so opening the modal (or
  // clicking Discard) doesn't write an empty draft right back.
  useEffect(() => {
    if (!existing && JSON.stringify(form) !== JSON.stringify(blankSignIn())) saveDraft(form);
  }, [form, existing, saveDraft]);

  useEffect(() => {
    if (existing) return;
    listReservations({ date: todayStr() })
      .then((rs) => setTodaysBookings(rs.filter((r) => ["pending", "confirmed"].includes(r.status))))
      .catch(() => setTodaysBookings([]));
  }, [existing]);

  // SignInModal never sets a table at creation - every new sign-in starts
  // unseated, i.e. at the back of the physical queue - so a wait estimate is
  // relevant here regardless of which button opened this modal.
  useEffect(() => {
    if (existing) return;
    const partySize = Number(form.partySize);
    if (!partySize || partySize <= 0) { setSuggestedWait(undefined); return; }
    let cancelled = false;
    estimateWait({ areaId: form.areaId || undefined, partySize })
      .then((r) => { if (!cancelled) setSuggestedWait(r.minutes); })
      .catch(() => { if (!cancelled) setSuggestedWait(undefined); });
    return () => { cancelled = true; };
  }, [existing, form.areaId, form.partySize]);

  const linkBooking = (id: string) => {
    const b = todaysBookings.find((r) => r.id === id);
    setForm((f) => ({
      ...f,
      reservationId: id,
      ...(b ? {
        guestName: b.guestName,
        guestPhone: b.guestPhone ?? f.guestPhone,
        partySize: String(b.partySize),
        areaId: b.areaId,
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
          areaId: form.areaId || null,
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
          areaId: form.areaId || undefined,
          purpose: form.purpose.trim() || undefined,
          host: form.host.trim() || undefined,
          notes: form.notes.trim() || undefined,
          signedInAt: form.timeIn !== nowTimeValue() ? isoFromTimeToday(form.timeIn) : undefined,
          quotedWaitMinutes: form.quotedWaitMinutes ? Number(form.quotedWaitMinutes) : undefined,
        });
      }
      clearDraft();
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
            <AreaSelect
              value={form.areaId} onChange={(id) => update("areaId", id)}
              locations={locations} areas={areas} allowNone noneLabel="—"
              className="w-full text-base sm:text-sm border border-border rounded-lg px-3 py-2 max-sm:min-h-11 bg-background text-foreground"
            />
          </div>
          {!existing && (
            <FormField label="Time in" name="timeIn" type="time" value={form.timeIn} onChange={update} />
          )}
          {!existing && (
            <FormField label="Quoted wait (min)" name="quotedWaitMinutes" type="number" value={form.quotedWaitMinutes} onChange={update} />
          )}
          {!existing && (
            <div className="sm:col-span-2 -mt-2">
              {suggestedWait === null ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">No table at this area can seat a party this size.</p>
              ) : suggestedWait !== undefined ? (
                <p className="text-xs text-muted-foreground">Estimated wait for a table right now: ~{suggestedWait}m</p>
              ) : null}
            </div>
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

export function AssignTableModal({
  signIn, tables, merges, occupiedTableIds, canWriteBookings = false, onClose, onSaved,
}: {
  signIn: GuestSignIn;
  tables: ReservationTable[];
  merges: TableMerge[];
  occupiedTableIds: Set<string>;
  /** Reservation:write - moving the clashing booking is a reservation edit. */
  canWriteBookings?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mergedTableIds = useMemo(() => new Set(merges.flatMap((m) => m.tableIds)), [merges]);
  const areaTables = (signIn.areaId ? tables.filter((t) => t.areaId === signIn.areaId) : tables)
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

  // No table fits right now - the guest is already an unseated sign-in (that
  // IS the wait list), so there's nothing to create. Just stop trying.
  const keepWaiting = () => {
    toast({ title: "Still waiting", description: `${signIn.guestName} (party of ${signIn.partySize}) stays on the wait list.` });
    onClose();
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
          <p className="text-xs text-muted-foreground">Party of {signIn.partySize}{signIn.areaName ? ` · ${signIn.areaName}` : ""}</p>
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
              <button onClick={keepWaiting}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10">
                Keep waiting
              </button>
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
              {clashBooking && canWriteBookings
                ? <button onClick={() => { /* open reschedule */ setBranch({ ...branch, code: "reschedule" }); }}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:opacity-90">
                    Reschedule that booking
                  </button>
                : <p className="opacity-80">{canWriteBookings ? "Open the Reservations tab to move it." : "Someone with reservation access needs to move that booking."}</p>}
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

// ── Rows ─────────────────────────────────────────────────────────────────

function WaitingRow({
  s, canWrite, canDelete, isFirst, isLast, atRisk, notifying, reordering,
  onNotify, onAssign, onCancel, onDelete, onMoveUp, onMoveDown,
}: {
  s: GuestSignIn;
  canWrite: boolean; canDelete: boolean;
  isFirst: boolean; isLast: boolean; atRisk: boolean;
  notifying: boolean; reordering: boolean;
  onNotify: () => void; onAssign: () => void; onCancel: () => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const notified = s.notifiedAt != null;
  return (
    <div className="border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{s.guestName}</span>
          <span className="text-muted-foreground">party of {s.partySize}</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={notified ? { backgroundColor: "#3b82f620", color: "#3b82f6" } : { backgroundColor: "#f59e0b20", color: "#f59e0b" }}>
            {notified ? "Notified" : "Waiting"}
          </span>
          {atRisk && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> At risk
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {s.areaName ?? "Any area"} · waiting {elapsed(s.signedInAt)}
          {s.quotedWaitMinutes != null && ` · quoted ~${s.quotedWaitMinutes}m`}
          {s.notifiedAt && ` · notified ${elapsed(s.notifiedAt)} ago`}
        </div>
        {s.guestPhone && (
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {s.guestPhone}</div>
        )}
        {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
      </div>
      {canWrite && (
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <div className="flex flex-col">
            <button onClick={onMoveUp} disabled={isFirst || reordering} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={onMoveDown} disabled={isLast || reordering} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
          {!notified && (
            <button onClick={onNotify} disabled={notifying} className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50">
              {notifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />} Notify
            </button>
          )}
          <button onClick={onAssign} className="flex items-center gap-1 text-primary hover:underline">
            <Armchair className="w-3.5 h-3.5" /> Assign table
          </button>
          <button onClick={onCancel} className="text-muted-foreground hover:text-destructive">Cancel</button>
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
  locations, areas, tables, history, canWrite, canDelete, canWriteBookings = false,
}: {
  locations: ReservationLocation[];
  areas: ReservationArea[];
  tables: ReservationTable[];
  /** Everything including archived rows, for the All list's filters (entries can
   *  still point at a retired table). Defaults to the active lists. */
  history?: { locations: ReservationLocation[]; areas: ReservationArea[]; tables: ReservationTable[] };
  canWrite: boolean;
  canDelete: boolean;
  /** Reservation:write, for rescheduling a booking that clashes with a seating. */
  canWriteBookings?: boolean;
}) {
  const [onPremises, setOnPremises] = useState<GuestSignIn[] | null>(null);
  const [dayHistory, setDayHistory] = useState<GuestSignIn[] | null>(null);
  const [merges, setMerges] = useState<TableMerge[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  // Signed out card: Day = one date, All = flat filterable list across every date.
  const [outMode, setOutMode] = useState<"day" | "all">("day");
  const [listRefresh, setListRefresh] = useState(0);
  const [error, setError] = useState("");

  const [showSignIn, setShowSignIn] = useState(false);
  const [editTarget, setEditTarget] = useState<GuestSignIn | null>(null);
  const [assignTarget, setAssignTarget] = useState<GuestSignIn | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<GuestSignIn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GuestSignIn | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

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

  // Re-created whenever selectedDate changes, so the 25s refresh always
  // closes over the current date rather than the one at mount time.
  useEffect(() => {
    load();
    const id = setInterval(load, 25_000);
    return () => clearInterval(id);
  }, [selectedDate]);

  // Forces a re-render every second for the live "waiting Xm" / at-risk
  // display in the Waiting card - stops as soon as this tab unmounts.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const signedOut = useMemo(
    () => (dayHistory ?? []).filter((s) => s.signedOutAt),
    [dayHistory],
  );
  const coversOnPremises = (onPremises ?? []).reduce((n, s) => n + s.partySize, 0);
  const seatedNow = (onPremises ?? []).filter((s) => s.tableId).length;

  // The physical queue at the door: on premises, no table yet. Sorted the
  // same way the server does for unseatedOnly, so the up/down reorder
  // buttons match what's on screen.
  const waiting = useMemo(
    () => (onPremises ?? [])
      .filter((s) => !s.tableId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.signedInAt.localeCompare(b.signedInAt)),
    [onPremises],
  );
  const seated = useMemo(() => (onPremises ?? []).filter((s) => s.tableId), [onPremises]);
  const longestWaitMs = tick >= 0
    ? waiting.reduce((max, s) => Math.max(max, Date.now() - new Date(s.signedInAt).getTime()), 0)
    : 0;

  // Tables with a walk-in sitting at them now, so the merge picker can skip
  // them. Seated *bookings* aren't in this list (the register doesn't load
  // reservations) but the server re-checks occupancy on merge-and-seat.
  const occupiedTableIds = useMemo(
    () => new Set((onPremises ?? []).filter((s) => s.tableId).map((s) => s.tableId as string)),
    [onPremises],
  );

  /** Reload the live register and, if it is showing, the All list. */
  const refreshAll = () => { setListRefresh((n) => n + 1); return load(); };

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError("");
    try { await fn(); await refreshAll(); return true; }
    catch (err) { setActionError(err instanceof Error ? err.message : "Action failed"); return false; }
  };

  const doExtend = (s: GuestSignIn, minutes: number) =>
    runAction(() => extendSignIn(s.id, minutes));

  const doNotify = async (s: GuestSignIn) => {
    setNotifyingId(s.id);
    await runAction(() => notifyGuest(s.id));
    setNotifyingId(null);
  };

  const doReorder = async (s: GuestSignIn, direction: "up" | "down") => {
    setReorderingId(s.id);
    await runAction(() => reorderSignIn(s.id, direction));
    setReorderingId(null);
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="On premises now" value={onPremises?.length ?? "—"} definition="Parties currently checked in and on premises, regardless of party size." />
        <KpiCard label="Covers on premises" value={coversOnPremises} definition="Total guest count currently on premises, across all parties." />
        <KpiCard label="Seated now" value={seatedNow} definition="Parties currently seated at a table, regardless of party size." />
        <KpiCard label="Guests today" value={dayHistory?.length ?? "—"} definition="All parties checked in today, including those who have since left." />
        <KpiCard label="Longest wait" value={waiting.length > 0 ? formatDuration(longestWaitMs) : "—"} definition="How long the longest-waiting party in the queue has been waiting." />
      </div>

      <DashCard
        title="Waiting"
        action={canWrite && (
          <button
            onClick={() => setShowSignIn(true)}
            disabled={areas.length === 0}
            className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Sign In Guest
          </button>
        )}
      >
        {onPremises === null ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No one is waiting right now.</p>
        ) : (
          <div className="space-y-2">
            {waiting.map((s, i) => (
              <WaitingRow
                key={s.id} s={s}
                canWrite={canWrite} canDelete={canDelete}
                isFirst={i === 0} isLast={i === waiting.length - 1}
                atRisk={isAtRisk(s)}
                notifying={notifyingId === s.id}
                reordering={reorderingId === s.id}
                onNotify={() => doNotify(s)}
                onAssign={() => setAssignTarget(s)}
                onCancel={() => setSignOutTarget(s)}
                onDelete={() => setDeleteTarget(s)}
                onMoveUp={() => doReorder(s, "up")}
                onMoveDown={() => doReorder(s, "down")}
              />
            ))}
          </div>
        )}
      </DashCard>

      <DashCard title="Seated">
        {onPremises === null ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : seated.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No one is currently seated.</p>
        ) : (
          <div className="space-y-2">
            {seated.map((s) => (
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1" role="group" aria-label="Signed out view">
              {([["day", "Day"], ["all", "All"]] as const).map(([id, label]) => (
                <button
                  key={id} onClick={() => setOutMode(id)} aria-pressed={outMode === id}
                  className={`text-sm px-3 py-1.5 max-sm:min-h-11 rounded-lg ${outMode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {outMode === "day" && (
              <input
                type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm border border-border rounded-lg px-2 py-1.5 max-sm:min-h-11 bg-background text-foreground"
              />
            )}
          </div>
        )}
      >
        {outMode === "all" ? (
          <AllSignIns
            locations={history?.locations ?? locations} areas={history?.areas ?? areas} tables={history?.tables ?? tables}
            canWrite={canWrite} canDelete={canDelete} refreshKey={listRefresh} onError={setError}
            onEdit={setEditTarget} onDelete={setDeleteTarget}
          />
        ) : dayHistory === null ? (
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
          areas={areas}
          existing={editTarget}
          onClose={() => { setShowSignIn(false); setEditTarget(null); }}
          onSaved={() => { setShowSignIn(false); setEditTarget(null); refreshAll(); }}
        />
      )}
      {assignTarget && (
        <AssignTableModal
          signIn={assignTarget}
          tables={tables}
          merges={merges}
          occupiedTableIds={occupiedTableIds}
          canWriteBookings={canWriteBookings}
          onClose={() => setAssignTarget(null)}
          onSaved={() => { setAssignTarget(null); refreshAll(); }}
        />
      )}
      <ConfirmDialog
        open={signOutTarget !== null}
        onOpenChange={(open) => { if (!open) { setSignOutTarget(null); setActionError(""); } }}
        title="Sign this guest out?"
        description={actionError || (signOutTarget
          ? `${signOutTarget.guestName} — party of ${signOutTarget.partySize}. ${signOutTarget.tableId ? "Their table is released." : "They'll be marked as left without being seated."}`
          : "")}
        confirmLabel="Sign out"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const target = signOutTarget!;
          const done = await runAction(() => signOutGuest(target.id));
          setBusy(false);
          if (done) {
            setSignOutTarget(null);
            if (target.tableId && target.tableName && target.areaId) {
              checkWaitlistMatch({
                name: target.tableName,
                areaId: target.areaId,
                capacity: target.tableCapacity ?? 0,
                maxExtraCapacity: target.tableMaxExtraCapacity ?? 0,
              });
            }
          }
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
