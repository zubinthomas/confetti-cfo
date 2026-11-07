// Captain-App-style "All Tables" floor view: a standalone, shell-free page
// (no sidebar/header/KPI cards - see src/pages/CheckATable.tsx for the same
// top-level-route trick) for staff who just need a fast, tablet-friendly
// floor glance rather than the full Reservations dashboard. Reuses the same
// data/status logic as the Day view (src/hooks/useFloorData.ts) so the two
// presentations can never disagree about what "Occupied" means.
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MoreVertical, Plus, Loader2, Grid2x2, List, Users } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useFloorData } from "@/hooks/useFloorData";
import { useGuestQueue } from "@/hooks/useGuestQueue";
import BigFloorTile from "@/components/reservations/BigFloorTile";
import TableCard from "@/components/reservations/TableCard";
import BookingRow from "@/components/reservations/BookingRow";
import WaitingRow from "@/components/reservations/WaitingRow";
import BookingModal from "@/components/reservations/BookingModal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SignInModal, AssignTableModal } from "@/components/reservations/GuestRegister";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { GuestSignIn } from "@/api/guestSignInsApi";
import { areaLabel, type ReservationTable } from "@/api/reservationsApi";
import TableModal from "@/components/reservations/TableModal";
import { bookingRows } from "@/components/reservations/reservationUi";
import { istDateStr, istMinutes } from "@/lib/ist";

const todayStr = () => istDateStr();
const nowMinutes = () => istMinutes();

export default function RestaurantFloorView() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const bookRead = can("Reservation", "read");
  const bookWrite = can("Reservation", "write");
  const bookDelete = can("Reservation", "delete");
  const regWrite = can("GuestRegister", "write");
  const regDelete = can("GuestRegister", "delete");
  const mergeWrite = bookWrite || regWrite;
  // Restaurant:write - this page's own route gate only requires Reservation:read
  // (see GATES.restaurantFloor), so someone can land here without it; the Edit
  // Table control below just stays hidden in that case.
  const catWrite = can("Restaurant", "write");

  const {
    locations, tables, merges, occupiedTableIds, loadingCatalog, error, setError,
    loadCatalog, loadReservations,
    dayAreas, unitsFor, floorWritable,
    freeTable, extendFloor, splitMerge, setReservationStatus, removeReservation,
    extendGuest, signOutOneGuest, deleteGuest,
  } = useFloorData({ bookRead, bookWrite, regWrite });

  const queue = useGuestQueue();

  const today = todayStr();
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [areaLayout, setAreaLayout] = useState<"grid" | "list">("grid");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  // Set right after sign-in, so seating the walk-in happens in the same
  // breath without leaving this page for the classic Guest Register tab.
  // Also reused for "change table" on an already-seated walk-in, from the
  // per-guest row in TableCard or the Waiting panel - AssignTableModal
  // already handles both.
  const [seatingSignIn, setSeatingSignIn] = useState<GuestSignIn | null>(null);
  // The table's own definition (name, capacity, merge settings), opened via
  // the pencil in TableCard - distinct from everything else here, which acts
  // on the table's live floor state, not the table itself.
  const [editingTable, setEditingTable] = useState<ReservationTable | null>(null);
  // Per-guest actions from a table's dialog (TableCard's walk-in rows).
  const [editingGuest, setEditingGuest] = useState<GuestSignIn | null>(null);
  const [signOutGuestTarget, setSignOutGuestTarget] = useState<GuestSignIn | null>(null);
  const [deleteGuestTarget, setDeleteGuestTarget] = useState<GuestSignIn | null>(null);
  const [guestActionBusy, setGuestActionBusy] = useState(false);
  // Same two actions, but for an entry in the Waiting panel (useGuestQueue's
  // own data, not useFloorData's) - kept separate so each confirms against
  // the dataset it actually reloads.
  const [queueSignOutTarget, setQueueSignOutTarget] = useState<GuestSignIn | null>(null);
  const [queueDeleteTarget, setQueueDeleteTarget] = useState<GuestSignIn | null>(null);
  const [queueActionBusy, setQueueActionBusy] = useState(false);

  useEffect(() => { loadCatalog(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadReservations(today); queue.load(); }, []);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) { loadReservations(today); queue.load(); } }, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const units = unitsFor(today);
  const areaId = activeAreaId ?? dayAreas[0]?.id ?? null;
  const activeArea = dayAreas.find((a) => a.id === areaId) ?? null;
  const areaUnits = areaId ? units.filter((u) => u.table.areaId === areaId) : [];
  const openUnit = openKey ? units.find((u) => u.key === openKey) ?? null : null;
  const locationName = locations.length > 1 && activeArea
    ? locations.find((l) => l.id === activeArea.locationId)?.name ?? null
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <button onClick={() => navigate("/restaurant?classic=1")} aria-label="Back to Restaurant" className="p-2 -ml-2 rounded-lg hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold flex-1 text-center truncate">
          {locationName ? `${locationName} · All Tables` : "All Tables"}
        </h1>
        <div className="flex items-center gap-1">
          {regWrite && (
            <button
              onClick={() => setShowQueue(true)}
              aria-label="Waiting queue"
              className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"
            >
              <Users className="w-4 h-4" /> {queue.waiting.length}
            </button>
          )}
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} aria-label="More options" className="p-2 -mr-2 rounded-lg hover:bg-muted">
              <MoreVertical className="w-5 h-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-md py-1 w-48">
                <button
                  onClick={() => { setMenuOpen(false); loadReservations(today); queue.load(); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  Refresh now
                </button>
                {bookWrite && (
                  <button
                    onClick={() => { setMenuOpen(false); setShowBooking(true); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  >
                    New reservation
                  </button>
                )}
                <button
                  onClick={() => navigate("/restaurant?classic=1")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  Switch to classic view
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <p className="px-4 pt-2 text-sm text-destructive">{error}</p>}

      {loadingCatalog ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : dayAreas.length === 0 ? (
        <p className="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
          No areas yet - add one under Locations &amp; Tables.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <div className="flex gap-2 overflow-x-auto flex-1">
              {dayAreas.map((a) => (
                <button
                  key={a.id} onClick={() => setActiveAreaId(a.id)} aria-pressed={a.id === areaId}
                  className={`shrink-0 text-sm px-3.5 py-2 rounded-lg whitespace-nowrap ${a.id === areaId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {areaLabel(a)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 shrink-0" role="group" aria-label="Table layout">
              <button
                onClick={() => setAreaLayout("grid")} aria-pressed={areaLayout === "grid"} aria-label="Grid layout"
                className={`p-1.5 rounded-lg ${areaLayout === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <Grid2x2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAreaLayout("list")} aria-pressed={areaLayout === "list"} aria-label="List layout"
                className={`p-1.5 rounded-lg ${areaLayout === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {areaUnits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tables in this area.</p>
            ) : areaLayout === "list" ? (
              bookingRows(areaUnits).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No reservations for this day.</p>
              ) : (
                <div className="space-y-2">
                  {bookingRows(areaUnits).map(({ booking, unit }) => (
                    <div key={booking.id} className="border border-border rounded-lg p-3">
                      <BookingRow
                        booking={booking} unit={unit}
                        bookWrite={bookWrite} bookDelete={bookDelete} nowMin={nowMinutes()}
                        onStatus={(id, status) => setReservationStatus(today, id, status)}
                        onRemove={(id) => removeReservation(today, id)}
                        onMoved={() => loadReservations(today)}
                      />
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
                {areaUnits.map((u) => <BigFloorTile key={u.key} unit={u} onOpen={() => setOpenKey(u.key)} />)}
              </div>
            )}
          </div>
        </>
      )}

      {regWrite && (
        <button
          onClick={() => setShowSignIn(true)}
          aria-label="Sign in a walk-in guest"
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Suspended (not closed) while a child modal launched from inside it is up,
          so the two overlays never stack - it reappears with the same table once
          the child clears its own state. */}
      <Dialog
        open={openUnit !== null && editingGuest === null && signOutGuestTarget === null && deleteGuestTarget === null && editingTable === null}
        onOpenChange={(o) => { if (!o) setOpenKey(null); }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {openUnit && (
            <>
              <DialogHeader>
                <DialogTitle>{openUnit.merge ? openUnit.merge.tableNames.join(" ＋ ") : openUnit.table.name}</DialogTitle>
                <DialogDescription className="sr-only">Floor status and bookings for this table</DialogDescription>
              </DialogHeader>
              <TableCard
                unit={openUnit} bordered={false}
                bookWrite={bookWrite} bookDelete={bookDelete} mergeWrite={mergeWrite}
                floorWritable={floorWritable(openUnit.floor)}
                regWrite={regWrite} regDelete={regDelete}
                canEditTable={catWrite} onEditTable={() => setEditingTable(openUnit.table)}
                onSplit={() => openUnit.merge && splitMerge(today, openUnit.merge)}
                onExtend={(m) => extendFloor(today, openUnit.floor, m)}
                onFree={() => freeTable(today, openUnit.floor, openUnit.table)}
                onStatus={(id, status) => setReservationStatus(today, id, status)}
                onRemove={(id) => removeReservation(today, id)}
                onMoved={() => loadReservations(today)}
                nowMin={nowMinutes()}
                onExtendGuest={(id, m) => extendGuest(today, id, m)}
                onSignOutGuest={(id) => {
                  const g = openUnit.floor.guests.find((x) => x.id === id);
                  if (g) setSignOutGuestTarget(g);
                }}
                onEditGuest={setEditingGuest}
                onAssignGuest={(g) => { setSeatingSignIn(g); setOpenKey(null); }}
                onDeleteGuest={(id) => {
                  const g = openUnit.floor.guests.find((x) => x.id === id);
                  if (g) setDeleteGuestTarget(g);
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {(showSignIn || editingGuest) && (
        <SignInModal
          locations={locations} areas={dayAreas} existing={editingGuest}
          onClose={() => { setShowSignIn(false); setEditingGuest(null); }}
          onSaved={(saved) => {
            setShowSignIn(false);
            const wasEditing = editingGuest !== null;
            setEditingGuest(null);
            if (wasEditing) loadReservations(today);
            else setSeatingSignIn(saved);
            queue.load();
          }}
        />
      )}

      {seatingSignIn && (
        <AssignTableModal
          // Keyed on the signIn being seated, so switching straight to the
          // next queue entry via onSeatNext remounts with fresh state
          // (table choice, expected-until, etc.) instead of reusing stale
          // state left over from the party just seated.
          key={seatingSignIn.id}
          signIn={seatingSignIn} tables={tables} merges={merges} occupiedTableIds={occupiedTableIds}
          allSignIns={queue.onPremises ?? []}
          canWriteBookings={bookWrite}
          nextWaiting={queue.waiting.find((w) => w.id !== seatingSignIn.id)}
          onClose={() => setSeatingSignIn(null)}
          onSaved={() => { setSeatingSignIn(null); loadReservations(today); queue.load(); }}
          onSeatNext={(next) => { setSeatingSignIn(next); loadReservations(today); queue.load(); }}
        />
      )}

      {editingTable && (
        <TableModal
          table={editingTable} tables={tables}
          areaId={editingTable.areaId}
          areaName={dayAreas.find((a) => a.id === editingTable.areaId)?.name ?? ""}
          onClose={() => setEditingTable(null)}
          onSaved={() => { setEditingTable(null); loadCatalog(); }}
        />
      )}

      {showBooking && (
        <BookingModal
          locations={locations} areas={dayAreas} tables={tables} defaultDate={today}
          onClose={() => setShowBooking(false)}
          onSaved={() => { setShowBooking(false); loadReservations(today); }}
        />
      )}

      {/* Same suspend-not-close treatment as the table dialog above, for the
          queue's own Cancel/Delete confirmations. */}
      <Sheet open={showQueue && queueSignOutTarget === null && queueDeleteTarget === null} onOpenChange={setShowQueue}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Waiting · {queue.waiting.length}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {queue.waiting.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No one is waiting.</p>
            ) : (
              queue.waiting.map((s, i) => (
                <WaitingRow
                  key={s.id} s={s}
                  canWrite={regWrite} canDelete={regDelete}
                  isFirst={i === 0} isLast={i === queue.waiting.length - 1}
                  notifying={queue.notifyingId === s.id} reordering={queue.reorderingId === s.id}
                  onNotify={() => queue.doNotify(s)}
                  onAssign={() => { setSeatingSignIn(s); setShowQueue(false); }}
                  onCancel={() => setQueueSignOutTarget(s)}
                  onDelete={() => setQueueDeleteTarget(s)}
                  onMoveUp={() => queue.doReorder(s, "up")}
                  onMoveDown={() => queue.doReorder(s, "down")}
                />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={queueSignOutTarget !== null}
        onOpenChange={(open) => { if (!open) { setQueueSignOutTarget(null); queue.setActionError(""); } }}
        title="Sign this guest out?"
        description={queue.actionError || (queueSignOutTarget
          ? `${queueSignOutTarget.guestName} — party of ${queueSignOutTarget.partySize}. They are removed from the waiting list.`
          : "")}
        confirmLabel="Sign out"
        loading={queueActionBusy}
        onConfirm={async () => {
          setQueueActionBusy(true);
          await queue.doSignOut(queueSignOutTarget!);
          setQueueActionBusy(false);
          setQueueSignOutTarget(null);
        }}
      />
      <ConfirmDialog
        open={queueDeleteTarget !== null}
        onOpenChange={(open) => { if (!open) { setQueueDeleteTarget(null); queue.setActionError(""); } }}
        title="Delete this register entry?"
        description={queue.actionError || (queueDeleteTarget ? `${queueDeleteTarget.guestName}'s sign-in will be permanently removed.` : "")}
        confirmLabel="Delete"
        destructive
        loading={queueActionBusy}
        onConfirm={async () => {
          setQueueActionBusy(true);
          await queue.doDelete(queueDeleteTarget!.id);
          setQueueActionBusy(false);
          setQueueDeleteTarget(null);
        }}
      />

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
          await signOutOneGuest(today, signOutGuestTarget!);
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
          await deleteGuest(today, deleteGuestTarget!.id);
          setGuestActionBusy(false);
          setDeleteGuestTarget(null);
        }}
      />
    </div>
  );
}
