// Shared by the Reservations tab's Day view (ReservationsTab.tsx) and the
// standalone Floor View page (src/pages/RestaurantFloorView.tsx), so the two
// presentations can never drift apart on what "free/reserved/late/occupied"
// means. Owns the catalog + today's-floor data and the floor-mutation calls;
// callers decide when to (re)load (mount, date change, tab switch, polling).
import { useState, useMemo } from "react";
import {
  listLocations, listAreas, listTables,
  listReservations, updateReservationStatus, deleteReservation,
  extendReservation, endReservationEarly, listTableMerges, releaseTableMerge, listTableOccupancy,
  type TableOccupancy, type ReservationLocation, type ReservationArea, type ReservationTable,
  type Reservation, type ReservationStatus, type TableMerge,
} from "@/api/reservationsApi";
import { listSignIns, signOutGuest, extendSignIn, deleteSignIn, type GuestSignIn } from "@/api/guestSignInsApi";
import { checkWaitlistMatch } from "@/lib/waitlistMatch";
import type { TableUnit } from "@/components/reservations/TableCard";
import { floorInfoFor, type FloorInfo } from "@/components/reservations/reservationUi";
import { istDateStr, istMinutes, istClock } from "@/lib/ist";

const todayStr = () => istDateStr();
const nowMinutes = () => istMinutes();
const clockOf = istClock;

export interface UseFloorDataOptions {
  /** Reservation:read - without it, reservation/sign-in/occupancy data is never fetched. */
  bookRead: boolean;
  /** Reservation:write - needed by extend/free when a seated booking is involved. */
  bookWrite: boolean;
  /** GuestRegister:write - needed by extend/free when a signed-in guest is involved. */
  regWrite: boolean;
}

export function useFloorData({ bookRead, bookWrite, regWrite }: UseFloorDataOptions) {
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
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [error, setError] = useState("");

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

  const occupancyByTable = useMemo(() => new Map(occupancy.map((o) => [o.tableId, o])), [occupancy]);

  // Tables with a walk-in sitting at them right now - mirrors GuestRegister's
  // own occupiedTableIds, so AssignTableModal's merge-candidate filtering
  // behaves identically whether it's opened from there or from Floor View.
  const occupiedTableIds = useMemo(() => new Set(signInsByTable.keys()), [signInsByTable]);

  const mergeByTableId = useMemo(() => {
    const map = new Map<string, TableMerge>();
    for (const m of merges) for (const id of m.tableIds) map.set(id, m);
    return map;
  }, [merges]);

  const floorFor = (t: ReservationTable, isToday: boolean, merge?: TableMerge): FloorInfo => {
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

  /** One entry per table, or per merged unit (drawn once, at its first table),
   *  with live floor status for `date` ("today" gets a real status, any other
   *  date is always "free" - see reservationUi.ts). */
  const unitsFor = (date: string): TableUnit[] => {
    const isToday = date === todayStr();
    return dayTables
      .filter((t) => {
        const m = mergeByTableId.get(t.id);
        return !m || m.tableIds[0] === t.id;
      })
      .map((t) => {
        const merge = mergeByTableId.get(t.id);
        const unitIds = merge ? merge.tableIds : [t.id];
        const bookings = unitIds.flatMap((id) => reservationsByTable.get(id) ?? [])
          .sort((a, b) => a.time.localeCompare(b.time));
        return { key: merge ? merge.id : t.id, table: t, merge, bookings, floor: floorFor(t, isToday, merge) };
      });
  };

  // Free table / Extend touch the seated booking and the signed-in guests, so
  // the user needs the write permission for every part the table actually has.
  // A walk-in the viewer can't name still needs register write to end or extend.
  const floorWritable = (floor: Pick<FloorInfo, "seatedBooking" | "guests" | "hiddenWalkIns">) =>
    (!floor.seatedBooking || bookWrite) && (floor.guests.length + floor.hiddenWalkIns === 0 || regWrite);

  const runFloorAction = async (date: string, fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await loadReservations(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  // One call per distinct tableGroupId (an ungrouped guest counts as its own
  // group) - signOut/extendSignIn both cascade to every sibling sharing a
  // table group server-side, so calling them once per *row* in floor.guests
  // would fire that cascade redundantly for a joined pair: signOut's second,
  // now-redundant call throws ("already signed out"), and extendSignIn has
  // no such guard and would silently double the extension.
  const oncePerTableGroup = (guests: GuestSignIn[]) => {
    const seen = new Set<string>();
    return guests.filter((g) => {
      const key = g.tableGroupId ?? g.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const freeTable = (date: string, floor: FloorInfo, table: ReservationTable) => runFloorAction(date, async () => {
    if (floor.seatedBooking) await endReservationEarly(floor.seatedBooking.id);
    await Promise.all(oncePerTableGroup(floor.guests).map((g) => signOutGuest(g.id)));
    checkWaitlistMatch(table);
  });

  const extendFloor = (date: string, floor: FloorInfo, minutes: number) => runFloorAction(date, async () => {
    if (floor.seatedBooking) {
      await extendReservation(floor.seatedBooking.id, floor.seatedBooking.durationMinutes + minutes);
    }
    await Promise.all(oncePerTableGroup(floor.guests).map((g) => extendSignIn(g.id, minutes)));
  });

  // Per-guest actions, from TableCard's walk-in rows - distinct from
  // freeTable/extendFloor above, which act on every occupant of the unit at
  // once. Same reload as every other floor mutation, so the tile/dialog this
  // guest came from reflects the change immediately.
  const extendGuest = (date: string, id: string, minutes: number) => runFloorAction(date, () => extendSignIn(id, minutes));

  const signOutOneGuest = (date: string, guest: GuestSignIn) => runFloorAction(date, async () => {
    await signOutGuest(guest.id);
    if (guest.tableId && guest.tableName && guest.areaId) checkWaitlistMatch({
      name: guest.tableName, areaId: guest.areaId,
      capacity: guest.tableCapacity ?? 0, maxExtraCapacity: guest.tableMaxExtraCapacity ?? 0,
    });
  });

  const deleteGuest = (date: string, id: string) => runFloorAction(date, () => deleteSignIn(id));

  const splitMerge = (date: string, merge: TableMerge) => runFloorAction(date, async () => {
    await releaseTableMerge(merge.id);
    for (const id of merge.tableIds) {
      const t = tables.find((x) => x.id === id);
      if (t) checkWaitlistMatch(t);
    }
  });

  const setReservationStatus = async (date: string, id: string, status: ReservationStatus) => {
    setError("");
    try {
      await updateReservationStatus(id, status);
      loadReservations(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update reservation");
    }
  };

  const removeReservation = async (date: string, id: string) => {
    setError("");
    try {
      await deleteReservation(id);
      loadReservations(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete reservation");
    }
  };

  return {
    allLocations, allAreas, allTables, locations, areas, tables,
    reservations, loadingCatalog, error, setError,
    loadCatalog, loadReservations,
    dayAreas, unitsFor, floorWritable,
    freeTable, extendFloor, splitMerge, setReservationStatus, removeReservation,
    extendGuest, signOutOneGuest, deleteGuest,
    merges, occupiedTableIds, daySignIns,
  };
}
