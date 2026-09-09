import React, { useState, useEffect, useMemo } from "react";
import {
  listLocations, createLocation, updateLocation, deleteLocation,
  listTables, createTable, updateTable, deleteTable,
  listReservations, createReservation, updateReservationStatus, deleteReservation,
  extendReservation, endReservationEarly, listTableMerges, releaseTableMerge,
  type ReservationLocation, type ReservationTable, type Reservation, type ReservationStatus, type TableMerge,
} from "@/api/reservationsApi";
import { listSignIns, signOutGuest, extendSignIn, type GuestSignIn } from "@/api/guestSignInsApi";
import { Plus, X, Loader2, Settings2, CalendarDays, Trash2, Pencil, DoorOpen, Clock, Link2, Link2Off } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import FormField from "@/components/hr/FormField";
import ConfirmDialog from "@/components/ConfirmDialog";
import GuestRegister from "@/components/reservations/GuestRegister";
import { useAuth } from "@/lib/AuthContext";
import { istDateStr, istMinutes, istClock } from "@/lib/ist";

const todayStr = () => istDateStr();

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending", confirmed: "Confirmed", seated: "Seated",
  completed: "Completed", cancelled: "Cancelled", no_show: "No-show",
};
const STATUS_COLORS: Record<ReservationStatus, string> = {
  pending: "#f59e0b", confirmed: "#3b82f6", seated: "#8b5cf6",
  completed: "#10b981", cancelled: "#ef4444", no_show: "#6b7280",
};
const ACTIVE_STATUSES: ReservationStatus[] = ["pending", "confirmed", "seated"];
const NEXT_ACTIONS: Partial<Record<ReservationStatus, { label: string; status: ReservationStatus }[]>> = {
  pending: [{ label: "Confirm", status: "confirmed" }, { label: "Cancel", status: "cancelled" }],
  confirmed: [{ label: "Seat", status: "seated" }, { label: "No-show", status: "no_show" }, { label: "Cancel", status: "cancelled" }],
  seated: [{ label: "Complete", status: "completed" }],
};

function endTime(time: string, durationMinutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const nowMinutes = () => istMinutes();
const clockOf = istClock;
const FLOOR_EXTEND_STEPS = [15, 30, 60];

const EMPTY_BOOKING = { locationId: "", tableId: "", date: todayStr(), time: "19:00", durationMinutes: "90", partySize: "2", guestName: "", guestPhone: "", guestEmail: "", notes: "" };

function BookingModal({ locations, tables, defaultDate, onClose, onSaved }: {
  locations: ReservationLocation[]; tables: ReservationTable[]; defaultDate: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_BOOKING, date: defaultDate, locationId: locations[0]?.id ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tablesForLocation = tables.filter((t) => t.locationId === form.locationId);
  useEffect(() => {
    if (!tablesForLocation.some((t) => t.id === form.tableId)) {
      setForm((f) => ({ ...f, tableId: tablesForLocation[0]?.id ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationId]);

  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const save = async () => {
    setError("");
    if (!form.tableId) { setError("Pick a table"); return; }
    if (!form.guestName.trim()) { setError("Guest name is required"); return; }
    const partySize = Number(form.partySize);
    const durationMinutes = Number(form.durationMinutes);
    if (!partySize || partySize <= 0) { setError("Enter a valid party size"); return; }
    setSaving(true);
    try {
      await createReservation({
        tableId: form.tableId, date: form.date, time: form.time, durationMinutes, partySize,
        guestName: form.guestName.trim(), guestPhone: form.guestPhone.trim() || undefined,
        guestEmail: form.guestEmail.trim() || undefined, notes: form.notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reservation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">New Reservation</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Location *</label>
            <select
              value={form.locationId} onChange={(e) => update("locationId", e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Table *</label>
            <select
              value={form.tableId} onChange={(e) => update("tableId", e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              {tablesForLocation.length === 0 && <option value="">No tables in this location</option>}
              {tablesForLocation.map((t) => <option key={t.id} value={t.id}>{t.name} (seats {t.capacity})</option>)}
            </select>
          </div>
          <FormField label="Date *" name="date" type="date" value={form.date} onChange={update} />
          <FormField label="Time *" name="time" type="time" value={form.time} onChange={update} />
          <FormField label="Duration (min)" name="durationMinutes" type="number" value={form.durationMinutes} onChange={update} />
          <FormField label="Party Size *" name="partySize" type="number" value={form.partySize} onChange={update} />
          <FormField label="Guest Name *" name="guestName" value={form.guestName} onChange={update} />
          <FormField label="Guest Phone" name="guestPhone" value={form.guestPhone} onChange={update} />
          <div className="sm:col-span-2"><FormField label="Guest Email" name="guestEmail" value={form.guestEmail} onChange={update} /></div>
          <div className="sm:col-span-2"><FormField label="Notes" name="notes" value={form.notes} onChange={update} /></div>
        </div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Book
          </button>
        </div>
      </div>
    </div>
  );
}

function LocationModal({ location, onClose, onSaved }: { location: ReservationLocation | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: location?.name ?? "", type: location?.type ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), type: form.type.trim() || null };
      if (location) await updateLocation(location.id, payload);
      else await createLocation(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{location ? "Edit Location" : "Add Location"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <FormField label="Name *" name="name" value={form.name} onChange={update} />
          <FormField label="Type" name="type" value={form.type} onChange={update} placeholder="e.g. Dine-in" />
        </div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function TableModal({ table, tables, locationId, locationName, onClose, onSaved }: {
  table: ReservationTable | null; tables: ReservationTable[];
  locationId: string; locationName: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: table?.name ?? "", type: table?.type ?? "",
    capacity: String(table?.capacity ?? ""),
    maxExtraCapacity: String(table?.maxExtraCapacity ?? "0"),
    freeMerge: table?.freeMerge ?? false,
    mergeableWith: (table?.mergeableWith ?? []) as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const toggleMergeWith = (id: string) => setForm((f) => ({
    ...f,
    mergeableWith: f.mergeableWith.includes(id)
      ? f.mergeableWith.filter((x) => x !== id)
      : [...f.mergeableWith, id],
  }));

  const siblings = tables.filter((t) => t.locationId === locationId && t.id !== table?.id);

  const save = async () => {
    setError("");
    const capacity = Number(form.capacity);
    if (!capacity || capacity <= 0) { setError("Enter a valid capacity"); return; }
    const maxExtraCapacity = Number(form.maxExtraCapacity) || 0;
    if (maxExtraCapacity < 0) { setError("Extra capacity can't be negative"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), type: form.type.trim() || null, capacity, maxExtraCapacity,
        freeMerge: form.freeMerge,
        // kept even when free merge is on (the list is only hidden), so turning
        // free merge back off later doesn't silently drop the pairings
        mergeableWith: form.mergeableWith,
      };
      if (table) await updateTable(table.id, payload);
      else await createTable({ locationId, ...payload });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save table");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{table ? "Edit Table" : `Add Table · ${locationName}`}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <FormField label="Name *" name="name" value={form.name} onChange={update} placeholder="e.g. Table 4" />
          <FormField label="Type" name="type" value={form.type} onChange={update} placeholder="e.g. Standard, Booth, Chef's Table" />
          <FormField label="Capacity (seats) *" name="capacity" type="number" value={form.capacity} onChange={update} />
          <FormField label="Max extra capacity" name="maxExtraCapacity" type="number" value={form.maxExtraCapacity} onChange={update} />
          <p className="text-xs text-muted-foreground -mt-2">Overflow seats the floor can squeeze on when friends join a full party. Default 0.</p>
          <div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={form.freeMerge} onChange={(e) => setForm((f) => ({ ...f, freeMerge: e.target.checked }))} />
              Free merge
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              No fixed list. This table can join any other free-merge table in {locationName}. The other table still has to allow it.
            </p>
          </div>
          {!form.freeMerge && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Can be merged with</span>
              {siblings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other tables in {locationName} yet.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                  {siblings.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" checked={form.mergeableWith.includes(t.id)} onChange={() => toggleMergeWith(t.id)} />
                      {t.name}{t.freeMerge ? " · free merge" : ""}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Reciprocal - the other table lists this one too. A 3-way merge needs every pair linked.
              </p>
            </div>
          )}
        </div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

type FloorInfo = {
  state: "free" | "reserved" | "occupied";
  label: string;
  until: string | null;
  seatedBooking?: Reservation;
  guests: GuestSignIn[];
};
const FLOOR_DOT: Record<FloorInfo["state"], string> = {
  free: "#10b981", reserved: "#f59e0b", occupied: "#8b5cf6",
};

function TableFloorLine({ floor, canWrite, onExtend, onFree }: {
  floor: FloorInfo; canWrite: boolean; onExtend: (m: number) => void; onFree: () => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
      <span className="text-xs flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOOR_DOT[floor.state] }} />
        <span className="text-muted-foreground">{floor.label}{floor.until ? ` · until ${floor.until}` : ""}</span>
      </span>
      {canWrite && floor.state === "occupied" && (
        <span className="flex items-center gap-2 text-xs">
          <span className="relative">
            <button onClick={() => setExtendOpen((v) => !v)} className="flex items-center gap-1 text-primary hover:underline">
              <Clock className="w-3.5 h-3.5" /> Extend
            </button>
            {extendOpen && (
              <span className="absolute right-0 mt-1 z-10 bg-card border border-border rounded-lg p-1 flex gap-1 shadow-md">
                {FLOOR_EXTEND_STEPS.map((m) => (
                  <button key={m} onClick={() => { setExtendOpen(false); onExtend(m); }}
                    className="text-xs px-2 py-1 rounded hover:bg-muted">+{m}</button>
                ))}
              </span>
            )}
          </span>
          <button onClick={onFree} className="text-primary hover:underline">Free table</button>
        </span>
      )}
    </div>
  );
}

export default function ReservationsTab() {
  const { can } = useAuth();
  const canWrite = can("Reservation", "write");
  const canDelete = can("Reservation", "delete");

  const [view, setView] = useState<"day" | "manage" | "signin">("signin");
  const [locations, setLocations] = useState<ReservationLocation[]>([]);
  const [tables, setTables] = useState<ReservationTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [daySignIns, setDaySignIns] = useState<GuestSignIn[]>([]);
  const [merges, setMerges] = useState<TableMerge[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [error, setError] = useState("");

  const [showBooking, setShowBooking] = useState(false);
  const [locationModal, setLocationModal] = useState<{ location: ReservationLocation | null } | null>(null);
  const [tableModal, setTableModal] = useState<{ table: ReservationTable | null; locationId: string; locationName: string } | null>(null);
  const [deleteLocationTarget, setDeleteLocationTarget] = useState<ReservationLocation | null>(null);
  const [deleteTableTarget, setDeleteTableTarget] = useState<ReservationTable | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const [locs, tbls] = await Promise.all([listLocations(), listTables()]);
      setLocations(locs);
      setTables(tbls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load locations and tables");
    } finally {
      setLoadingCatalog(false);
    }
  };

  const loadReservations = async (date: string) => {
    try {
      const [rs, signIns, ms] = await Promise.all([
        listReservations({ date }),
        listSignIns({ date }).catch(() => [] as GuestSignIn[]),
        listTableMerges().catch(() => [] as TableMerge[]),
      ]);
      setReservations(rs);
      setDaySignIns(signIns);
      setMerges(ms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reservations");
    }
  };

  useEffect(() => { loadCatalog(); }, []);
  // Re-fetch whenever the day view is (re-)entered or the date changes: the
  // Guest Register tab mutates the same sign-ins/merges from its own state, so
  // switching back here must pick those changes up without a page reload.
  useEffect(() => { loadReservations(selectedDate); }, [view, selectedDate]);

  const reservationsByTable = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations ?? []) {
      const list = map.get(r.tableId) ?? [];
      list.push(r);
      map.set(r.tableId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [reservations]);

  const signInsByTable = useMemo(() => {
    const map = new Map<string, GuestSignIn[]>();
    for (const s of daySignIns) {
      if (!s.tableId || s.signedOutAt) continue;
      const list = map.get(s.tableId) ?? [];
      list.push(s);
      map.set(s.tableId, list);
    }
    return map;
  }, [daySignIns]);

  const isToday = selectedDate === todayStr();

  const mergeByTableId = useMemo(() => {
    const map = new Map<string, TableMerge>();
    for (const m of merges) for (const id of m.tableIds) map.set(id, m);
    return map;
  }, [merges]);

  /** Live status of a table (or a merged unit, when `merge` is passed) on the
   *  selected day: who's sitting there now and what's next. */
  const tableFloor = (t: ReservationTable, merge?: TableMerge): FloorInfo => {
    const ids = merge ? merge.tableIds : [t.id];
    const bookings = ids.flatMap((id) => reservationsByTable.get(id) ?? []);
    const guests = ids.flatMap((id) => signInsByTable.get(id) ?? []);
    const seatedBooking = bookings.find((b) => b.status === "seated");
    const now = nowMinutes();
    const nextBooking = isToday
      ? bookings.find((b) => ["pending", "confirmed"].includes(b.status) && toMin(b.time) >= now)
      : undefined;

    if (seatedBooking || guests.length > 0) {
      const names = [
        ...(seatedBooking ? [seatedBooking.guestName] : []),
        ...guests.map((g) => g.guestName),
      ];
      const untilBooking = seatedBooking ? endTime(seatedBooking.time, seatedBooking.durationMinutes) : null;
      const untilGuest = guests
        .map((g) => (g.expectedUntil ? clockOf(g.expectedUntil) : null))
        .filter(Boolean)
        .sort()
        .pop();
      return {
        state: "occupied" as const,
        label: `Occupied · ${names.join(", ")}`,
        until: untilBooking ?? untilGuest ?? null,
        seatedBooking,
        guests,
      };
    }
    if (nextBooking) {
      return { state: "reserved" as const, label: `Next booking ${nextBooking.time}`, until: null, seatedBooking: undefined, guests: [] };
    }
    return { state: "free" as const, label: "Free", until: null, seatedBooking: undefined, guests: [] };
  };

  const coversBooked = (reservations ?? [])
    .filter((r) => ACTIVE_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + r.partySize, 0);
  const activeCount = (reservations ?? []).filter((r) => ACTIVE_STATUSES.includes(r.status)).length;

  const setReservationStatus = async (id: string, status: ReservationStatus) => {
    setError("");
    try {
      await updateReservationStatus(id, status);
      loadReservations(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update reservation");
    }
  };

  const runFloorAction = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await loadReservations(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const freeTable = (floor: ReturnType<typeof tableFloor>) => runFloorAction(async () => {
    if (floor.seatedBooking) await endReservationEarly(floor.seatedBooking.id);
    await Promise.all(floor.guests.map((g) => signOutGuest(g.id)));
  });

  const extendFloor = (floor: ReturnType<typeof tableFloor>, minutes: number) => runFloorAction(async () => {
    if (floor.seatedBooking) {
      await extendReservation(floor.seatedBooking.id, floor.seatedBooking.durationMinutes + minutes);
    }
    await Promise.all(floor.guests.map((g) => extendSignIn(g.id, minutes)));
  });

  const splitMerge = (mergeId: string) => runFloorAction(() => releaseTableMerge(mergeId));

  const removeReservation = async (id: string) => {
    setError("");
    try {
      await deleteReservation(id);
      loadReservations(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete reservation");
    }
  };

  const confirmDeleteLocation = async () => {
    if (!deleteLocationTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteLocation(deleteLocationTarget.id);
      setDeleteLocationTarget(null);
      loadCatalog();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete location");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteTable = async () => {
    if (!deleteTableTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteTable(deleteTableTarget.id);
      setDeleteTableTarget(null);
      loadCatalog();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete table");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView("signin")}
          className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${view === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          <DoorOpen className="w-4 h-4" /> Guest Register
        </button>
        <button
          onClick={() => setView("day")}
          className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${view === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          <CalendarDays className="w-4 h-4" /> Reservations
        </button>
        <button
          onClick={() => setView("manage")}
          className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${view === "manage" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          <Settings2 className="w-4 h-4" /> Locations &amp; Tables
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {view === "day" ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Reservations Today" value={activeCount} />
            <KpiCard label="Covers Booked" value={coversBooked} />
            <KpiCard label="Locations" value={locations.length} />
            <KpiCard label="Tables" value={tables.length} />
          </div>

          <DashCard
            title="Day view"
            action={(
              <div className="flex items-center gap-3">
                <input
                  type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
                />
                {canWrite && (
                  <button
                    onClick={() => setShowBooking(true)}
                    disabled={locations.length === 0 || tables.length === 0}
                    className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> New Reservation
                  </button>
                )}
              </div>
            )}
          >
            {loadingCatalog || reservations === null ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No locations yet - add one under "Locations &amp; Tables".</p>
            ) : (
              <div className="space-y-5">
                {locations.map((loc) => {
                  const locTables = tables.filter((t) => t.locationId === loc.id);
                  if (locTables.length === 0) return null;
                  return (
                    <div key={loc.id}>
                      <p className="text-sm font-semibold text-foreground mb-2">{loc.name}</p>
                      <div className="space-y-3">
                        {locTables.filter((t) => {
                          const m = mergeByTableId.get(t.id);
                          return !m || m.tableIds[0] === t.id; // merged unit renders once, at its first table
                        }).map((t) => {
                          const merge = mergeByTableId.get(t.id);
                          const unitIds = merge ? merge.tableIds : [t.id];
                          const bookings = unitIds.flatMap((id) => reservationsByTable.get(id) ?? [])
                            .sort((a, b) => a.time.localeCompare(b.time));
                          const floor = tableFloor(t, merge);
                          return (
                            <div key={merge ? merge.id : t.id} className="border border-border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                  {merge && <Link2 className="w-3.5 h-3.5 text-primary" />}
                                  {merge ? merge.tableNames.join(" ＋ ") : t.name}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-2">
                                  seats {merge ? `${merge.combinedCapacity} (merged)` : `${t.capacity}${t.maxExtraCapacity ? ` +${t.maxExtraCapacity}` : ""}`}
                                  {merge && canWrite && (
                                    <button onClick={() => splitMerge(merge.id)} className="text-primary hover:underline flex items-center gap-1">
                                      <Link2Off className="w-3.5 h-3.5" /> Split
                                    </button>
                                  )}
                                </span>
                              </div>
                              <TableFloorLine
                                floor={floor}
                                canWrite={canWrite}
                                onExtend={(m) => extendFloor(floor, m)}
                                onFree={() => freeTable(floor)}
                              />
                              {bookings.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No bookings today</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {bookings.map((r) => (
                                    <div key={r.id} className="flex items-center justify-between gap-2 text-sm flex-wrap">
                                      <div className="min-w-0">
                                        <span className="font-medium text-foreground">{r.time}–{endTime(r.time, r.durationMinutes)}</span>{" "}
                                        <span className="text-muted-foreground">· {r.guestName} · party of {r.partySize}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${STATUS_COLORS[r.status]}20`, color: STATUS_COLORS[r.status] }}>
                                          {STATUS_LABELS[r.status]}
                                        </span>
                                        {canWrite && (NEXT_ACTIONS[r.status] ?? []).map((a) => (
                                          <button key={a.status} onClick={() => setReservationStatus(r.id, a.status)} className="text-xs text-primary hover:underline">
                                            {a.label}
                                          </button>
                                        ))}
                                        {canDelete && (
                                          <button onClick={() => removeReservation(r.id)} className="text-muted-foreground hover:text-destructive">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {locations.every((loc) => tables.filter((t) => t.locationId === loc.id).length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">No tables yet - add some under "Locations &amp; Tables".</p>
                )}
              </div>
            )}
          </DashCard>
        </>
      ) : view === "signin" ? (
        <GuestRegister locations={locations} tables={tables} canWrite={canWrite} canDelete={canDelete} />
      ) : (
        <DashCard
          title="Locations & Tables"
          action={canWrite && (
            <button
              onClick={() => setLocationModal({ location: null })}
              className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Add Location
            </button>
          )}
        >
          {loadingCatalog ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : locations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No locations yet.</p>
          ) : (
            <div className="space-y-5">
              {locations.map((loc) => {
                const locTables = tables.filter((t) => t.locationId === loc.id);
                return (
                  <div key={loc.id} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{loc.name}</span>
                        {loc.type && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{loc.type}</span>}
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-3">
                          <button onClick={() => setLocationModal({ location: loc })} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          {canDelete && (
                            <button onClick={() => { setDeleteError(""); setDeleteLocationTarget(loc); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      )}
                    </div>
                    {locTables.length === 0 ? (
                      <p className="text-xs text-muted-foreground mb-3">No tables yet.</p>
                    ) : (
                      <div className="space-y-1.5 mb-3">
                        {locTables.map((t) => (
                          <div key={t.id} className="flex items-center justify-between text-sm border-b border-border last:border-b-0 pb-1.5 last:pb-0">
                            <span className="text-foreground">{t.name} <span className="text-muted-foreground">· seats {t.capacity}{t.type ? ` · ${t.type}` : ""}</span></span>
                            {canWrite && (
                              <div className="flex items-center gap-3">
                                <button onClick={() => setTableModal({ table: t, locationId: loc.id, locationName: loc.name })} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                                {canDelete && (
                                  <button onClick={() => { setDeleteError(""); setDeleteTableTarget(t); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {canWrite && (
                      <button
                        onClick={() => setTableModal({ table: null, locationId: loc.id, locationName: loc.name })}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Table
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DashCard>
      )}

      {showBooking && (
        <BookingModal
          locations={locations} tables={tables} defaultDate={selectedDate}
          onClose={() => setShowBooking(false)}
          onSaved={() => { setShowBooking(false); loadReservations(selectedDate); }}
        />
      )}
      {locationModal && (
        <LocationModal
          location={locationModal.location}
          onClose={() => setLocationModal(null)}
          onSaved={() => { setLocationModal(null); loadCatalog(); }}
        />
      )}
      {tableModal && (
        <TableModal
          table={tableModal.table} tables={tables} locationId={tableModal.locationId} locationName={tableModal.locationName}
          onClose={() => setTableModal(null)}
          onSaved={() => { setTableModal(null); loadCatalog(); }}
        />
      )}
      <ConfirmDialog
        open={deleteLocationTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteLocationTarget(null); setDeleteError(""); } }}
        title="Delete this location?"
        description={deleteError || (deleteLocationTarget ? `"${deleteLocationTarget.name}" will be permanently removed. This can't be undone.` : "")}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDeleteLocation}
      />
      <ConfirmDialog
        open={deleteTableTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteTableTarget(null); setDeleteError(""); } }}
        title="Delete this table?"
        description={deleteError || (deleteTableTarget ? `"${deleteTableTarget.name}" will be permanently removed. This can't be undone.` : "")}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDeleteTable}
      />
    </div>
  );
}
