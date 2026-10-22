// Restaurant module API (server/routes/reservations.ts, mounted at /api/restaurant) - locations,
// areas, tables, and reservations. All four are dedicated endpoints, not the
// generic entities API, since capacity/overlap checks and delete guards
// need server-side logic the generic CRUD can't express.
import { get, post, patch, del } from "./http";

/** A venue, e.g. "Sienna, Hindustan Park". Holds areas. */
export interface ReservationLocation {
  id: string;
  createdDate: string;
  name: string;
}

/** A room or zone inside a location, optionally on a named floor. Holds tables. */
export interface ReservationArea {
  id: string;
  createdDate: string;
  locationId: string;
  name: string;
  /** "Ground Floor", "First Floor"... null when the area is its own floor. */
  floor: string | null;
  type: string | null;
}

/** "Cafe, Ground Floor", or just the name when the area has no floor label. */
export const areaLabel = (a: { name: string; floor: string | null }) => (a.floor ? `${a.name}, ${a.floor}` : a.name);

export interface ReservationTable {
  id: string;
  createdDate: string;
  areaId: string;
  name: string;
  type: string | null;
  capacity: number;
  maxExtraCapacity: number;
  /** True: no fixed list, this table drops its own merge restriction (the
   *  other table's list still applies). */
  freeMerge: boolean;
  /** Table ids this one may be pushed together with, both directions, hydrated
   *  by the server from table_merge_links. */
  mergeableWith: string[];
}

/** Mirrors tablesCanMerge on the server (server/db/tableMerges.ts): two tables
 *  may be merged iff they share an area AND either is listed by the other or
 *  both are free-merge. `mergeableWith` is symmetric, so the direction of the
 *  includes check does not matter. */
export function canMergeTables(a: ReservationTable, b: ReservationTable): boolean {
  if (a.id === b.id) return false;
  if (a.areaId !== b.areaId) return false;
  if (a.mergeableWith.includes(b.id)) return true;
  return a.freeMerge && b.freeMerge;
}

export type ReservationStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";

export interface Reservation {
  id: string;
  createdDate: string;
  tableId: string;
  tableName: string;
  tableCapacity: number;
  areaId: string;
  areaName: string;
  floor: string | null;
  locationName: string;
  date: string;
  time: string;
  durationMinutes: number;
  partySize: number;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  status: ReservationStatus;
  notes: string | null;
  seatedAt: string | null;
  departedAt: string | null;
  tableMaxExtraCapacity: number;
}

export const listLocations = () => get<ReservationLocation[]>("/restaurant/locations");
export const createLocation = (data: { name: string }) =>
  post<ReservationLocation>("/restaurant/locations", data);
export const updateLocation = (id: string, data: { name?: string }) =>
  patch<ReservationLocation>(`/restaurant/locations/${id}`, data);
export const deleteLocation = (id: string) => del(`/restaurant/locations/${id}`);

export const listAreas = (locationId?: string) =>
  get<ReservationArea[]>(`/restaurant/areas${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`);
export const createArea = (data: { locationId: string; name: string; floor?: string | null; type?: string | null }) =>
  post<ReservationArea>("/restaurant/areas", data);
export const updateArea = (id: string, data: { name?: string; floor?: string | null; type?: string | null }) =>
  patch<ReservationArea>(`/restaurant/areas/${id}`, data);
export const deleteArea = (id: string) => del(`/restaurant/areas/${id}`);

export const listTables = (areaId?: string) =>
  get<ReservationTable[]>(`/restaurant/tables${areaId ? `?areaId=${encodeURIComponent(areaId)}` : ""}`);
export const createTable = (data: {
  areaId: string; name: string; type?: string | null; capacity: number;
  maxExtraCapacity?: number; freeMerge?: boolean; mergeableWith?: string[];
}) => post<ReservationTable>("/restaurant/tables", data);
export const updateTable = (id: string, data: {
  name?: string; type?: string | null; capacity?: number; maxExtraCapacity?: number;
  freeMerge?: boolean; mergeableWith?: string[];
}) => patch<ReservationTable>(`/restaurant/tables/${id}`, data);
export const deleteTable = (id: string) => del(`/restaurant/tables/${id}`);

export const listReservations = (params: { date?: string; tableId?: string; areaId?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.tableId) query.set("tableId", params.tableId);
  if (params.areaId) query.set("areaId", params.areaId);
  const qs = query.toString();
  return get<Reservation[]>(`/restaurant${qs ? `?${qs}` : ""}`);
};

export const createReservation = (data: {
  tableId: string;
  date: string;
  time: string;
  durationMinutes?: number;
  partySize: number;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  notes?: string;
}) => post<Reservation>("/restaurant", data);

export const updateReservationStatus = (id: string, status: ReservationStatus) =>
  patch<Reservation>(`/restaurant/${id}/status`, { status });

export const extendReservation = (id: string, durationMinutes: number) =>
  patch<Reservation>(`/restaurant/${id}/extend`, { durationMinutes });

export const rescheduleReservation = (id: string, data: { date?: string; time?: string; durationMinutes?: number }) =>
  patch<Reservation>(`/restaurant/${id}/reschedule`, data);

export const endReservationEarly = (id: string) =>
  patch<Reservation>(`/restaurant/${id}/end-early`, {});

export const deleteReservation = (id: string) => del(`/restaurant/${id}`);

// ── Table merges ─────────────────────────────────────────────────────────

export type MergeKind = "adjacent" | "end_to_end";

export interface TableMerge {
  id: string;
  createdDate: string;
  mergeKind: MergeKind;
  combinedCapacity: number;
  bufferMinutes: number;
  releasedAt: string | null;
  tableIds: string[];
  tableNames: string[];
  areaId: string | null;
}

export const listTableMerges = () => get<TableMerge[]>("/restaurant/table-merges");

export const createTableMerge = (data: {
  tableIds: string[];
  mergeKind: MergeKind;
  combinedCapacity?: number;
  bufferMinutes?: number;
}) => post<TableMerge>("/restaurant/table-merges", data);

export const releaseTableMerge = (id: string) =>
  patch<TableMerge>(`/restaurant/table-merges/${id}/release`, {});
