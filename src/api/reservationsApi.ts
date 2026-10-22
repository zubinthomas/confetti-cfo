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
  /** ISO timestamp when archived, null while active. */
  archivedAt: string | null;
  /** Has (or had) areas: it can be archived but not deleted permanently. */
  hasHistory: boolean;
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
  archivedAt: string | null;
  /** Has (or had) tables or guest-register entries: archive only. */
  hasHistory: boolean;
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
  archivedAt: string | null;
  /** Ever booked or signed in: archive only. */
  hasHistory: boolean;
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

/** Catalog lists hide archived rows unless asked: "include" returns both, "only" just the archived. */
export type ArchivedFilter = "include" | "only";
const archivedQs = (archived?: ArchivedFilter, extra: string[] = []) => {
  const parts = [...extra, ...(archived ? [`archived=${archived}`] : [])];
  return parts.length ? `?${parts.join("&")}` : "";
};

export const listLocations = (archived?: ArchivedFilter) =>
  get<ReservationLocation[]>(`/restaurant/locations${archivedQs(archived)}`);
export const createLocation = (data: { name: string }) =>
  post<ReservationLocation>("/restaurant/locations", data);
export const updateLocation = (id: string, data: { name?: string }) =>
  patch<ReservationLocation>(`/restaurant/locations/${id}`, data);
/** DELETE archives. The server refuses while bookings are upcoming or active children remain. */
export const archiveLocation = (id: string) => del(`/restaurant/locations/${id}`);
export const restoreLocation = (id: string) => post<{ message: string }>(`/restaurant/locations/${id}/restore`, {});
/** Permanent delete, only for a row that never had any history. */
export const purgeLocation = (id: string) => del(`/restaurant/locations/${id}?purge=true`);

export const listAreas = (locationId?: string, archived?: ArchivedFilter) =>
  get<ReservationArea[]>(`/restaurant/areas${archivedQs(archived, locationId ? [`locationId=${encodeURIComponent(locationId)}`] : [])}`);
export const createArea = (data: { locationId: string; name: string; floor?: string | null; type?: string | null }) =>
  post<ReservationArea>("/restaurant/areas", data);
export const updateArea = (id: string, data: { name?: string; floor?: string | null; type?: string | null }) =>
  patch<ReservationArea>(`/restaurant/areas/${id}`, data);
export const archiveArea = (id: string) => del(`/restaurant/areas/${id}`);
export const restoreArea = (id: string) => post<{ message: string }>(`/restaurant/areas/${id}/restore`, {});
export const purgeArea = (id: string) => del(`/restaurant/areas/${id}?purge=true`);

export const listTables = (areaId?: string, archived?: ArchivedFilter) =>
  get<ReservationTable[]>(`/restaurant/tables${archivedQs(archived, areaId ? [`areaId=${encodeURIComponent(areaId)}`] : [])}`);
export const createTable = (data: {
  areaId: string; name: string; type?: string | null; capacity: number;
  maxExtraCapacity?: number; freeMerge?: boolean; mergeableWith?: string[];
}) => post<ReservationTable>("/restaurant/tables", data);
export const updateTable = (id: string, data: {
  name?: string; type?: string | null; capacity?: number; maxExtraCapacity?: number;
  freeMerge?: boolean; mergeableWith?: string[];
}) => patch<ReservationTable>(`/restaurant/tables/${id}`, data);
export const archiveTable = (id: string) => del(`/restaurant/tables/${id}`);
export const restoreTable = (id: string) => post<{ message: string }>(`/restaurant/tables/${id}/restore`, {});
export const purgeTable = (id: string) => del(`/restaurant/tables/${id}?purge=true`);

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

export interface ReservationPage { rows: Reservation[]; total: number }

/** One page of reservations across all days (the "All" list). `from`/`to` are inclusive. */
export const listReservationPage = (params: {
  from?: string; to?: string; status?: ReservationStatus | ""; areaId?: string; q?: string;
  order?: "asc" | "desc"; limit?: number; offset?: number;
} = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return get<ReservationPage>(`/restaurant/all${qs ? `?${qs}` : ""}`);
};
