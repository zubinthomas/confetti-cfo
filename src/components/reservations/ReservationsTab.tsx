import React, { useState, useEffect, useMemo } from "react";
import {
  listLocations, createLocation, updateLocation, archiveLocation, restoreLocation, purgeLocation,
  listAreas, createArea, updateArea, archiveArea, restoreArea, purgeArea,
  listTables, createTable, updateTable, archiveTable, restoreTable, purgeTable,
  listReservations, createReservation, updateReservationStatus, deleteReservation,
  extendReservation, endReservationEarly, listTableMerges, releaseTableMerge, listTableOccupancy,
  type TableOccupancy, type ReservationLocation, type ReservationArea, type ReservationTable, type Reservation, type ReservationStatus, type TableMerge,
} from "@/api/reservationsApi";
import { listSignIns, signOutGuest, extendSignIn, type GuestSignIn } from "@/api/guestSignInsApi";
import { checkWaitlistMatch } from "@/lib/waitlistMatch";
import { Plus, X, Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import FormField from "@/components/hr/FormField";
import ConfirmDialog from "@/components/ConfirmDialog";
import GuestRegister from "@/components/reservations/GuestRegister";
import AllReservations from "@/components/reservations/AllReservations";
import AreaSelect from "@/components/reservations/AreaSelect";
import CatalogManager from "@/components/reservations/CatalogManager";
import DayFloor, { DayFloorControls, isDayLayout, type DayLayout } from "@/components/reservations/DayFloor";
import type { TableUnit } from "@/components/reservations/TableCard";
import { type CatalogKind } from "@/components/reservations/CatalogParts";
import { useAuth } from "@/lib/AuthContext";
import { useTabs } from "@/lib/layout/useTabs";
import { istDateStr, istMinutes, istClock } from "@/lib/ist";
import { ACTIVE_STATUSES, allCollapsed, collapseAreas, expandAreas, floorInfoFor, isIdList, toggleId, type FloorInfo } from "@/components/reservations/reservationUi";
import { usePersistedState } from "@/hooks/usePersistedState";

const todayStr = () => istDateStr();

const nowMinutes = () => istMinutes();
const clockOf = istClock;

const EMPTY_BOOKING = { areaId: "", tableId: "", date: todayStr(), time: "19:00", durationMinutes: "90", partySize: "2", guestName: "", guestPhone: "", guestEmail: "", notes: "" };

function BookingModal({ locations, areas, tables, defaultDate, onClose, onSaved }: {
  locations: ReservationLocation[]; areas: ReservationArea[]; tables: ReservationTable[]; defaultDate: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_BOOKING, date: defaultDate, areaId: areas.find((a) => tables.some((t) => t.areaId === a.id))?.id ?? areas[0]?.id ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tablesForArea = tables.filter((t) => t.areaId === form.areaId);
  useEffect(() => {
    if (!tablesForArea.some((t) => t.id === form.tableId)) {
      setForm((f) => ({ ...f, tableId: tablesForArea[0]?.id ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.areaId]);

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
            <label className="text-xs text-muted-foreground block mb-1">Area *</label>
            <AreaSelect
              value={form.areaId} onChange={(id) => update("areaId", id)}
              locations={locations} areas={areas}
              className="w-full text-base sm:text-sm border border-border rounded-lg px-3 py-2 max-sm:min-h-11 bg-background text-foreground"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Table *</label>
            <select
              value={form.tableId} onChange={(e) => update("tableId", e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              {tablesForArea.length === 0 && <option value="">No tables in this area</option>}
              {tablesForArea.map((t) => <option key={t.id} value={t.id}>{t.name} (seats {t.capacity})</option>)}
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

function ModalShell({ title, onClose, onSave, saving, error, children }: {
  title: string; onClose: () => void; onSave: () => void; saving: boolean; error: string; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="max-sm:p-2 max-sm:-mr-2"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 max-sm:min-h-11 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={onSave} disabled={saving} className="text-sm px-4 py-2 max-sm:min-h-11 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function LocationModal({ location, onClose, onSaved }: { location: ReservationLocation | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: location?.name ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = { name: form.name.trim() };
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
    <ModalShell title={location ? "Edit Location" : "Add Location"} onClose={onClose} onSave={save} saving={saving} error={error}>
      <FormField label="Name *" name="name" value={form.name} onChange={update} placeholder="e.g. Sienna, Hindustan Park" />
    </ModalShell>
  );
}

function AreaModal({ area, locationId, locationName, onClose, onSaved }: {
  area: ReservationArea | null; locationId: string; locationName: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: area?.name ?? "", floor: area?.floor ?? "", type: area?.type ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), floor: form.floor.trim() || null, type: form.type.trim() || null };
      if (area) await updateArea(area.id, payload);
      else await createArea({ locationId, ...payload });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save area");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={area ? "Edit Area" : `Add Area · ${locationName}`} onClose={onClose} onSave={save} saving={saving} error={error}>
      <FormField label="Name *" name="name" value={form.name} onChange={update} placeholder="e.g. Cafe, Restaurant, Bar" />
      <FormField label="Floor" name="floor" value={form.floor} onChange={update} placeholder="e.g. Ground Floor (leave empty if the area is its own floor)" />
      <FormField label="Type" name="type" value={form.type} onChange={update} placeholder="e.g. Dine-in" />
    </ModalShell>
  );
}

function TableModal({ table, tables, areaId, areaName, canDelete, onArchive, onClose, onSaved }: {
  table: ReservationTable | null; tables: ReservationTable[];
  areaId: string; areaName: string;
  /** Restaurant:delete. With it, editing an existing table offers Archive. */
  canDelete: boolean; onArchive: () => void;
  onClose: () => void; onSaved: () => void;
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

  const siblings = tables.filter((t) => t.areaId === areaId && t.id !== table?.id);

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
      else await createTable({ areaId, ...payload });
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
          <h2 className="text-base font-semibold text-foreground">{table ? "Edit Table" : `Add Table · ${areaName}`}</h2>
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
              No fixed list. This table can join any other free-merge table in {areaName}. The other table still has to allow it.
            </p>
          </div>
          {!form.freeMerge && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Can be merged with</span>
              {siblings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other tables in {areaName} yet.</p>
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
        <div className="px-6 pb-6 flex items-center gap-3">
          {table && canDelete && (
            <button onClick={onArchive} className="text-sm px-4 py-2 rounded-lg text-destructive hover:bg-destructive/10 mr-auto">Archive</button>
          )}
          <span className="flex gap-3 ml-auto">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

const CATALOG_CALLS: Record<"archive" | "restore" | "purge", Record<CatalogKind, (id: string) => Promise<unknown>>> = {
  archive: { location: archiveLocation, area: archiveArea, table: archiveTable },
  restore: { location: restoreLocation, area: restoreArea, table: restoreTable },
  purge: { location: purgeLocation, area: purgeArea, table: purgeTable },
};


export default function ReservationsTab() {
  const { can } = useAuth();
  // The module is three permission resources: the Locations & Tables catalog
  // (Restaurant), bookings (Reservation) and sign-ins (GuestRegister).
  const catWrite = can("Restaurant", "write");
  const catDelete = can("Restaurant", "delete");
  const bookRead = can("Reservation", "read");
  const bookWrite = can("Reservation", "write");
  const bookDelete = can("Reservation", "delete");
  const regWrite = can("GuestRegister", "write");
  const regDelete = can("GuestRegister", "delete");
  // Splitting a merge is open to either floor permission (same as the API).
  const mergeWrite = bookWrite || regWrite;
  // Free table / Extend touch the seated booking and the signed-in guests, so
  // the user needs the write permission for every part the table actually has.
  // A walk-in the viewer can't name still needs register write to end or extend.
  const floorWritable = (floor: { seatedBooking?: unknown; guests: unknown[]; hiddenWalkIns: number }) =>
    (!floor.seatedBooking || bookWrite) && (floor.guests.length + floor.hiddenWalkIns === 0 || regWrite);

  // Order and opening view come from the layout registry (PAGE_TABS.reservations).
  const { tabs: viewTabs, active: view, setActive: setView } = useTabs("restaurant");
  // Everything the server has, archived rows included. `locations`, `areas` and
  // `tables` below are the active subset, which is what pickers, the guest
  // register and the counts use; the full lists only feed the day view (an
  // archived table still shows its past bookings) and the manager's archive view.
  const [allLocations, setAllLocations] = useState<ReservationLocation[]>([]);
  const [allAreas, setAllAreas] = useState<ReservationArea[]>([]);
  const [allTables, setAllTables] = useState<ReservationTable[]>([]);
  const locations = useMemo(() => allLocations.filter((l) => !l.archivedAt), [allLocations]);
  const areas = useMemo(() => allAreas.filter((a) => !a.archivedAt), [allAreas]);
  const tables = useMemo(() => allTables.filter((t) => !t.archivedAt), [allTables]);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [daySignIns, setDaySignIns] = useState<GuestSignIn[]>([]);
  const [occupancy, setOccupancy] = useState<TableOccupancy[]>([]);
  const [merges, setMerges] = useState<TableMerge[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  // Day = per-table floor view for one date; All = flat, filterable list of every booking.
  const [dayMode, setDayMode] = useState<"day" | "all">("day");
  const [listRefresh, setListRefresh] = useState(0);
  // Day mode layout and which areas are collapsed: remembered per browser. Stored
  // as collapsed ids, so an area created later starts open.
  const [dayLayout, setDayLayout] = usePersistedState<DayLayout>("restaurant.day.view", "grid", isDayLayout);
  const [dayCollapsed, setDayCollapsed] = usePersistedState<string[]>("restaurant.day.collapsed", [], isIdList);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [error, setError] = useState("");

  const [showBooking, setShowBooking] = useState(false);
  const [locationModal, setLocationModal] = useState<{ location: ReservationLocation | null } | null>(null);
  const [areaModal, setAreaModal] = useState<{ area: ReservationArea | null; locationId: string; locationName: string } | null>(null);
  const [tableModal, setTableModal] = useState<{ table: ReservationTable | null; areaId: string; areaName: string } | null>(null);
  const [catalogAction, setCatalogAction] = useState<{ mode: "archive" | "purge"; kind: CatalogKind; id: string; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const [locs, ars, tbls] = await Promise.all([listLocations("include"), listAreas(undefined, "include"), listTables(undefined, "include")]);
      setAllLocations(locs);
      setAllAreas(ars);
      setAllTables(tbls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load locations, areas and tables");
    } finally {
      setLoadingCatalog(false);
    }
  };

  const loadReservations = async (date: string) => {
    if (!bookRead) return;
    try {
      const [rs, signIns, ms, occ] = await Promise.all([
        listReservations({ date }),
        // Names only come back for someone with Guest Register access.
        listSignIns({ date }).catch(() => [] as GuestSignIn[]),
        listTableMerges().catch(() => [] as TableMerge[]),
        listTableOccupancy().catch(() => [] as TableOccupancy[]),
      ]);
      setReservations(rs);
      setDaySignIns(signIns);
      setMerges(ms);
      setOccupancy(occ);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reservations");
    }
  };

  useEffect(() => { loadCatalog(); }, []);
  // Re-fetch whenever the day view is (re-)entered or the date changes: the
  // Guest Register tab mutates the same sign-ins/merges from its own state, so
  // switching back here must pick those changes up without a page reload.
  useEffect(() => { loadReservations(selectedDate); }, [view, selectedDate]);
  // Other staff seat and clear tables too, and a booking turns Late on the
  // clock, so today's floor refreshes itself while the tab is in front.
  useEffect(() => {
    if (!bookRead || selectedDate !== todayStr()) return;
    const timer = setInterval(() => { if (!document.hidden) loadReservations(selectedDate); }, 30_000);
    return () => clearInterval(timer);
  }, [bookRead, selectedDate]);

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

  // Active tables, plus an archived one that has bookings on the selected day, so
  // a past day never loses a booking just because its table was retired later.
  const dayTables = useMemo(
    () => allTables.filter((t) => !t.archivedAt || reservationsByTable.has(t.id)),
    [allTables, reservationsByTable],
  );
  const dayAreas = useMemo(
    () => allAreas.filter((a) => !a.archivedAt || dayTables.some((t) => t.areaId === a.id)),
    [allAreas, dayTables],
  );

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

  const occupancyByTable = useMemo(() => new Map(occupancy.map((o) => [o.tableId, o])), [occupancy]);

  const mergeByTableId = useMemo(() => {
    const map = new Map<string, TableMerge>();
    for (const m of merges) for (const id of m.tableIds) map.set(id, m);
    return map;
  }, [merges]);

  /** Live status of a table (or a merged unit, when `merge` is passed) on the
   *  selected day: who's sitting there now, who is late, and what's next. */
  const tableFloor = (t: ReservationTable, merge?: TableMerge): FloorInfo => {
    const ids = merge ? merge.tableIds : [t.id];
    const here = ids.map((id) => occupancyByTable.get(id)).filter((o): o is TableOccupancy => !!o);
    return floorInfoFor({
      bookings: ids.flatMap((id) => reservationsByTable.get(id) ?? []),
      guests: ids.flatMap((id) => signInsByTable.get(id) ?? []),
      occupancy: here.length > 0
        ? { parties: here.reduce((n, o) => n + o.parties, 0), until: here.map((o) => o.until).sort().pop()! }
        : undefined,
      nowMin: nowMinutes(),
      isToday,
      clock: clockOf,
    });
  };

  // One entry per table, or per merged unit (drawn once, at its first table).
  const dayUnits: TableUnit[] = dayTables
    .filter((t) => {
      const m = mergeByTableId.get(t.id);
      return !m || m.tableIds[0] === t.id;
    })
    .map((t) => {
      const merge = mergeByTableId.get(t.id);
      const unitIds = merge ? merge.tableIds : [t.id];
      const bookings = unitIds.flatMap((id) => reservationsByTable.get(id) ?? [])
        .sort((a, b) => a.time.localeCompare(b.time));
      return { key: merge ? merge.id : t.id, table: t, merge, bookings, floor: tableFloor(t, merge) };
    });
  const dayAreaIds = dayAreas.filter((a) => dayUnits.some((u) => u.table.areaId === a.id)).map((a) => a.id);

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

  const freeTable = (floor: FloorInfo, table: ReservationTable) => runFloorAction(async () => {
    if (floor.seatedBooking) await endReservationEarly(floor.seatedBooking.id);
    await Promise.all(floor.guests.map((g) => signOutGuest(g.id)));
    checkWaitlistMatch(table);
  });

  const extendFloor = (floor: FloorInfo, minutes: number) => runFloorAction(async () => {
    if (floor.seatedBooking) {
      await extendReservation(floor.seatedBooking.id, floor.seatedBooking.durationMinutes + minutes);
    }
    await Promise.all(floor.guests.map((g) => extendSignIn(g.id, minutes)));
  });

  const splitMerge = (merge: TableMerge) => runFloorAction(async () => {
    await releaseTableMerge(merge.id);
    for (const id of merge.tableIds) {
      const t = tables.find((x) => x.id === id);
      if (t) checkWaitlistMatch(t);
    }
  });

  const removeReservation = async (id: string) => {
    setError("");
    try {
      await deleteReservation(id);
      loadReservations(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete reservation");
    }
  };

  const confirmCatalogAction = async () => {
    if (!catalogAction) return;
    const { mode, kind, id } = catalogAction;
    setDeleting(true);
    setDeleteError("");
    try {
      await CATALOG_CALLS[mode][kind](id);
      setCatalogAction(null);
      loadCatalog();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : `Failed to ${mode === "archive" ? "archive" : "delete"} ${kind}`);
    } finally {
      setDeleting(false);
    }
  };

  const restoreItem = async (kind: CatalogKind, id: string) => {
    setError("");
    try {
      await CATALOG_CALLS.restore[kind](id);
      loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to restore ${kind}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {viewTabs.map((tab) => {
          const Icon = tab.icon!;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${view === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {view === "day" ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Reservations Today" value={activeCount} definition="Active reservations for today." />
            <KpiCard label="Covers Booked" value={coversBooked} definition="Total guest count across today's reservations." />
            <KpiCard label="Areas" value={areas.length} definition="Dining areas (cafe, restaurant, bar...) configured for reservations." />
            <KpiCard label="Tables" value={tables.length} definition="Tables configured across all areas." />
          </div>

          <DashCard
            title={dayMode === "day" ? "Day view" : "All reservations"}
            action={(
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1" role="group" aria-label="Reservation view">
                  {([["day", "Day"], ["all", "All"]] as const).map(([id, label]) => (
                    <button
                      key={id} onClick={() => setDayMode(id)} aria-pressed={dayMode === id}
                      className={`text-sm px-3 py-1.5 max-sm:min-h-11 rounded-lg ${dayMode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {dayMode === "day" && (
                  <>
                    <input
                      type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                      className="text-sm border border-border rounded-lg px-2 py-1.5 max-sm:min-h-11 bg-background text-foreground"
                    />
                    <DayFloorControls
                      layout={dayLayout} onLayout={setDayLayout}
                      everyAreaCollapsed={dayLayout === "grid" && dayAreaIds.length > 0 ? allCollapsed(dayAreaIds, dayCollapsed) : null}
                      onToggleAll={() => setDayCollapsed((ids) => (allCollapsed(dayAreaIds, ids) ? expandAreas(dayAreaIds, ids) : collapseAreas(dayAreaIds, ids)))}
                    />
                  </>
                )}
                {bookWrite && (
                  <button
                    onClick={() => setShowBooking(true)}
                    disabled={areas.length === 0 || tables.length === 0}
                    className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> New Reservation
                  </button>
                )}
              </div>
            )}
          >
            {dayMode === "all" ? (
              <AllReservations
                locations={locations} areas={areas} canWrite={bookWrite} canDelete={bookDelete}
                refreshKey={listRefresh} onError={setError}
              />
            ) : loadingCatalog || reservations === null ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : areas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No areas yet - add one under "Locations &amp; Tables".</p>
            ) : (
              <div className="space-y-5">
                <DayFloor
                  areas={dayAreas} locations={locations} units={dayUnits}
                  layout={dayLayout} collapsed={dayCollapsed}
                  onToggleArea={(id) => setDayCollapsed((ids) => toggleId(ids, id))}
                  bookWrite={bookWrite} bookDelete={bookDelete} mergeWrite={mergeWrite}
                  floorWritable={floorWritable}
                  onSplit={splitMerge} onExtend={extendFloor} onFree={(u) => freeTable(u.floor, u.table)}
                  onStatus={setReservationStatus} onRemove={removeReservation}
                  onMoved={() => loadReservations(selectedDate)} nowMin={nowMinutes()}
                />
                {areas.every((a) => tables.filter((t) => t.areaId === a.id).length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">No tables yet - add some under "Locations &amp; Tables".</p>
                )}
              </div>
            )}
          </DashCard>
        </>
      ) : view === "signin" ? (
        <GuestRegister
          locations={locations} areas={areas} tables={tables}
          history={{ locations: allLocations, areas: allAreas, tables: allTables }}
          canWrite={regWrite} canDelete={regDelete} canWriteBookings={bookWrite}
        />
      ) : (
        <CatalogManager
          loading={loadingCatalog}
          locations={showArchived ? allLocations : locations}
          areas={showArchived ? allAreas : areas}
          tables={showArchived ? allTables : tables}
          showArchived={showArchived} onShowArchived={setShowArchived}
          canWrite={catWrite} canDelete={catDelete}
          onAddLocation={() => setLocationModal({ location: null })}
          onAddArea={(loc) => setAreaModal({ area: null, locationId: loc.id, locationName: loc.name })}
          onAddTable={(area) => setTableModal({ table: null, areaId: area.id, areaName: area.name })}
          onEditLocation={(loc) => setLocationModal({ location: loc })}
          onEditArea={(area, loc) => setAreaModal({ area, locationId: loc.id, locationName: loc.name })}
          onEditTable={(t, area) => setTableModal({ table: t, areaId: area.id, areaName: area.name })}
          onArchive={(kind, id, name) => { setDeleteError(""); setCatalogAction({ mode: "archive", kind, id, name }); }}
          onRestore={restoreItem}
          onPurge={(kind, id, name) => { setDeleteError(""); setCatalogAction({ mode: "purge", kind, id, name }); }}
        />
      )}

      {showBooking && (
        <BookingModal
          locations={locations} areas={areas} tables={tables} defaultDate={selectedDate}
          onClose={() => setShowBooking(false)}
          onSaved={() => { setShowBooking(false); loadReservations(selectedDate); setListRefresh((n) => n + 1); }}
        />
      )}
      {locationModal && (
        <LocationModal
          location={locationModal.location}
          onClose={() => setLocationModal(null)}
          onSaved={() => { setLocationModal(null); loadCatalog(); }}
        />
      )}
      {areaModal && (
        <AreaModal
          area={areaModal.area} locationId={areaModal.locationId} locationName={areaModal.locationName}
          onClose={() => setAreaModal(null)}
          onSaved={() => { setAreaModal(null); loadCatalog(); }}
        />
      )}
      {tableModal && (
        <TableModal
          table={tableModal.table} tables={tables} areaId={tableModal.areaId} areaName={tableModal.areaName}
          canDelete={catDelete}
          onArchive={() => {
            const t = tableModal.table;
            setTableModal(null);
            if (t) { setDeleteError(""); setCatalogAction({ mode: "archive", kind: "table", id: t.id, name: t.name }); }
          }}
          onClose={() => setTableModal(null)}
          onSaved={() => { setTableModal(null); loadCatalog(); }}
        />
      )}
      <ConfirmDialog
        open={catalogAction !== null}
        onOpenChange={(open) => { if (!open) { setCatalogAction(null); setDeleteError(""); } }}
        title={catalogAction?.mode === "purge" ? `Delete this ${catalogAction.kind} permanently?` : `Archive this ${catalogAction?.kind ?? "item"}?`}
        description={deleteError || (catalogAction
          ? catalogAction.mode === "purge"
            ? `"${catalogAction.name}" has no history and will be removed for good. This can't be undone.`
            : `"${catalogAction.name}" will be hidden from lists and the booking form. Past bookings keep it, and you can restore it under Show archived.`
          : "")}
        confirmLabel={catalogAction?.mode === "purge" ? "Delete permanently" : "Archive"}
        destructive={catalogAction?.mode === "purge"}
        loading={deleting}
        onConfirm={confirmCatalogAction}
      />
    </div>
  );
}
