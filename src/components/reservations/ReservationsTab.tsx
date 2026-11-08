import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  createLocation, updateLocation, archiveLocation, restoreLocation, purgeLocation,
  archiveArea, restoreArea, purgeArea,
  archiveTable, restoreTable, purgeTable, getStaleCount,
  type ReservationLocation, type ReservationArea, type ReservationTable, type StaleCount,
} from "@/api/reservationsApi";
import { Plus, Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import FormField from "@/components/hr/FormField";
import ConfirmDialog from "@/components/ConfirmDialog";
import GuestRegister, { SignInModal, AssignTableModal } from "@/components/reservations/GuestRegister";
import AllReservations from "@/components/reservations/AllReservations";
import BookingModal from "@/components/reservations/BookingModal";
import CatalogManager from "@/components/reservations/CatalogManager";
import TableModal from "@/components/reservations/TableModal";
import ModalShell from "@/components/reservations/ModalShell";
import AreaModal from "@/components/reservations/AreaModal";
import GuestCheckInSettings from "@/components/reservations/GuestCheckInSettings";
import MenuManager from "@/components/reservations/MenuManager";
import DayFloor, { DayFloorControls, isDayLayout, type DayLayout } from "@/components/reservations/DayFloor";
import type { TableUnit } from "@/components/reservations/TableCard";
import { type CatalogKind } from "@/components/reservations/CatalogParts";
import type { GuestSignIn } from "@/api/guestSignInsApi";
import { useAuth } from "@/lib/AuthContext";
import { useTabs } from "@/lib/layout/useTabs";
import { istDateStr, istMinutes } from "@/lib/ist";
import { ACTIVE_STATUSES, allCollapsed, collapseAreas, expandAreas, isIdList, toggleId } from "@/components/reservations/reservationUi";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useFloorData } from "@/hooks/useFloorData";

const todayStr = () => istDateStr();

const nowMinutes = () => istMinutes();

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
  const checkinWrite = can("GuestCheckIn", "write");
  const menuWrite = can("Menu", "write");
  const menuDelete = can("Menu", "delete");
  // Splitting a merge is open to either floor permission (same as the API).
  const mergeWrite = bookWrite || regWrite;

  // Floor View's "N auto-closed" badge deep-links here with this state.
  const location = useLocation();
  const wantsAutoClosed = (location.state as { preset?: string } | null)?.preset === "autoClosed";

  // Order and opening view come from the layout registry (PAGE_TABS.reservations).
  const { tabs: viewTabs, active: view, setActive: setView } = useTabs("restaurant");
  // useTabs' own state can't take an initial override, so force the Day tab
  // once on mount when the deep link asks for it - the resolved default may
  // not be "day" for every role.
  useEffect(() => { if (wantsAutoClosed) setView("day"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedDate, setSelectedDate] = useState(todayStr());
  // Day = per-table floor view for one date; All = flat, filterable list of every booking.
  const [dayMode, setDayMode] = useState<"day" | "all">(wantsAutoClosed ? "all" : "day");
  const [listRefresh, setListRefresh] = useState(0);
  const [staleCount, setStaleCount] = useState<StaleCount>({ reservations: 0, signIns: 0 });
  // Day mode layout and which areas are collapsed: remembered per browser. Stored
  // as collapsed ids, so an area created later starts open.
  const [dayLayout, setDayLayout] = usePersistedState<DayLayout>("restaurant.day.view", "grid", isDayLayout);
  const [dayCollapsed, setDayCollapsed] = usePersistedState<string[]>("restaurant.day.collapsed", [], isIdList);

  const [showBooking, setShowBooking] = useState(false);
  const [locationModal, setLocationModal] = useState<{ location: ReservationLocation | null } | null>(null);
  const [areaModal, setAreaModal] = useState<{ area: ReservationArea | null; locationId: string; locationName: string } | null>(null);
  const [tableModal, setTableModal] = useState<{ table: ReservationTable | null; areaId: string; areaName: string } | null>(null);
  const [catalogAction, setCatalogAction] = useState<{ mode: "archive" | "purge"; kind: CatalogKind; id: string; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Per-guest actions from a table's dialog (TableCard's walk-in rows) -
  // distinct from the booking-centric modals above.
  const [editingGuest, setEditingGuest] = useState<GuestSignIn | null>(null);
  const [assigningGuest, setAssigningGuest] = useState<GuestSignIn | null>(null);
  const [signOutGuestTarget, setSignOutGuestTarget] = useState<GuestSignIn | null>(null);
  const [deleteGuestTarget, setDeleteGuestTarget] = useState<GuestSignIn | null>(null);
  const [guestActionBusy, setGuestActionBusy] = useState(false);
  // DayFloor's own table dialog suspends itself (instead of stacking a second
  // overlay) while one of these return-to-parent modals is up.
  const detailDialogSuspended = editingGuest !== null || signOutGuestTarget !== null || deleteGuestTarget !== null;

  const {
    allLocations, allAreas, allTables, locations, areas, tables,
    reservations, loadingCatalog, error, setError,
    loadCatalog, loadReservations,
    dayAreas, unitsFor, floorWritable,
    freeTable, extendFloor, dismissOverdue, splitMerge, setReservationStatus, removeReservation,
    extendGuest, signOutOneGuest, deleteGuest, merges, occupiedTableIds, daySignIns,
  } = useFloorData({ bookRead, bookWrite, regWrite });

  useEffect(() => { loadCatalog(); }, []);
  useEffect(() => { getStaleCount().then(setStaleCount).catch(() => {}); }, []);
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

  // One entry per table, or per merged unit (drawn once, at its first table).
  const dayUnits: TableUnit[] = unitsFor(selectedDate);
  const dayAreaIds = dayAreas.filter((a) => dayUnits.some((u) => u.table.areaId === a.id)).map((a) => a.id);

  const coversBooked = (reservations ?? [])
    .filter((r) => ACTIVE_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + r.partySize, 0);
  const activeCount = (reservations ?? []).filter((r) => ACTIVE_STATUSES.includes(r.status)).length;

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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KpiCard label="Reservations Today" value={activeCount} definition="Active reservations for today." />
            <KpiCard label="Covers Booked" value={coversBooked} definition="Total guest count across today's reservations." />
            <KpiCard label="Areas" value={areas.length} definition="Dining areas (cafe, restaurant, bar...) configured for reservations." />
            <KpiCard label="Tables" value={tables.length} definition="Tables configured across all areas." />
            <KpiCard label="Auto-closed today" value={staleCount.reservations} definition="Bookings the stale-occupancy sweep closed on its own, because they were left seated from a previous day." />
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
                initialAutoClosedOnly={wantsAutoClosed}
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
                  regWrite={regWrite} regDelete={regDelete}
                  onSplit={(m) => splitMerge(selectedDate, m)} onExtend={(f, m) => extendFloor(selectedDate, f, m)}
                  onFree={(u) => freeTable(selectedDate, u.floor, u.table)}
                  onDismissAlert={(u) => dismissOverdue(selectedDate, u.floor)}
                  onStatus={(id, status) => setReservationStatus(selectedDate, id, status)}
                  onRemove={(id) => removeReservation(selectedDate, id)}
                  onMoved={() => loadReservations(selectedDate)} nowMin={nowMinutes()}
                  onExtendGuest={(id, m) => extendGuest(selectedDate, id, m)}
                  onSignOutGuest={setSignOutGuestTarget}
                  onEditGuest={setEditingGuest}
                  onAssignGuest={setAssigningGuest}
                  onDeleteGuest={setDeleteGuestTarget}
                  detailDialogSuspended={detailDialogSuspended}
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
      ) : view === "checkin" ? (
        <GuestCheckInSettings canWrite={checkinWrite} />
      ) : view === "menu" ? (
        <MenuManager areas={areas} canWrite={menuWrite} canDelete={menuDelete} />
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
      {editingGuest && (
        <SignInModal
          locations={locations} areas={areas} existing={editingGuest}
          onClose={() => setEditingGuest(null)}
          onSaved={() => { setEditingGuest(null); loadReservations(selectedDate); }}
        />
      )}
      {assigningGuest && (
        <AssignTableModal
          signIn={assigningGuest} tables={tables} merges={merges} occupiedTableIds={occupiedTableIds}
          allSignIns={daySignIns}
          canWriteBookings={bookWrite}
          onClose={() => setAssigningGuest(null)}
          onSaved={() => { setAssigningGuest(null); loadReservations(selectedDate); }}
        />
      )}
      <ConfirmDialog
        open={signOutGuestTarget !== null}
        onOpenChange={(open) => { if (!open) { setSignOutGuestTarget(null); setError(""); } }}
        title="Sign this guest out?"
        description={error || (signOutGuestTarget
          ? `${signOutGuestTarget.guestName} — party of ${signOutGuestTarget.partySize}. Their table is released.`
          : "")}
        confirmLabel="Sign out"
        loading={guestActionBusy}
        onConfirm={async () => {
          setGuestActionBusy(true);
          await signOutOneGuest(selectedDate, signOutGuestTarget!);
          setGuestActionBusy(false);
          setSignOutGuestTarget(null);
        }}
      />
      <ConfirmDialog
        open={deleteGuestTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteGuestTarget(null); setError(""); } }}
        title="Delete this register entry?"
        description={error || (deleteGuestTarget ? `${deleteGuestTarget.guestName}'s sign-in will be permanently removed.` : "")}
        confirmLabel="Delete"
        destructive
        loading={guestActionBusy}
        onConfirm={async () => {
          setGuestActionBusy(true);
          await deleteGuest(selectedDate, deleteGuestTarget!.id);
          setGuestActionBusy(false);
          setDeleteGuestTarget(null);
        }}
      />
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
