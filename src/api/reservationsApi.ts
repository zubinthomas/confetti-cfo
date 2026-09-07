// Reservation management (server/routes/reservations.ts) - locations,
// tables, and reservations. All three are dedicated endpoints, not the
// generic entities API, since capacity/overlap checks and delete guards
// need server-side logic the generic CRUD can't express.
import { get, post, patch, del } from "./http";

export interface ReservationLocation {
  id: string;
  createdDate: string;
  name: string;
  type: string | null;
}

export interface ReservationTable {
  id: string;
  createdDate: string;
  locationId: string;
  name: string;
  type: string | null;
  capacity: number;
  maxExtraCapacity: number;
}

export type ReservationStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";

export interface Reservation {
  id: string;
  createdDate: string;
  tableId: string;
  tableName: string;
  tableCapacity: number;
  locationId: string;
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

export const listLocations = () => get<ReservationLocation[]>("/reservations/locations");
export const createLocation = (data: { name: string; type?: string | null }) =>
  post<ReservationLocation>("/reservations/locations", data);
export const updateLocation = (id: string, data: { name?: string; type?: string | null }) =>
  patch<ReservationLocation>(`/reservations/locations/${id}`, data);
export const deleteLocation = (id: string) => del(`/reservations/locations/${id}`);

export const listTables = (locationId?: string) =>
  get<ReservationTable[]>(`/reservations/tables${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`);
export const createTable = (data: { locationId: string; name: string; type?: string | null; capacity: number; maxExtraCapacity?: number }) =>
  post<ReservationTable>("/reservations/tables", data);
export const updateTable = (id: string, data: { name?: string; type?: string | null; capacity?: number; maxExtraCapacity?: number }) =>
  patch<ReservationTable>(`/reservations/tables/${id}`, data);
export const deleteTable = (id: string) => del(`/reservations/tables/${id}`);

export const listReservations = (params: { date?: string; tableId?: string; locationId?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.tableId) query.set("tableId", params.tableId);
  if (params.locationId) query.set("locationId", params.locationId);
  const qs = query.toString();
  return get<Reservation[]>(`/reservations${qs ? `?${qs}` : ""}`);
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
}) => post<Reservation>("/reservations", data);

export const updateReservationStatus = (id: string, status: ReservationStatus) =>
  patch<Reservation>(`/reservations/${id}/status`, { status });

export const extendReservation = (id: string, durationMinutes: number) =>
  patch<Reservation>(`/reservations/${id}/extend`, { durationMinutes });

export const rescheduleReservation = (id: string, data: { date?: string; time?: string; durationMinutes?: number }) =>
  patch<Reservation>(`/reservations/${id}/reschedule`, data);

export const endReservationEarly = (id: string) =>
  patch<Reservation>(`/reservations/${id}/end-early`, {});

export const deleteReservation = (id: string) => del(`/reservations/${id}`);

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
  locationId: string | null;
}

export const listTableMerges = () => get<TableMerge[]>("/reservations/table-merges");

export const createTableMerge = (data: {
  tableIds: string[];
  mergeKind: MergeKind;
  combinedCapacity?: number;
  bufferMinutes?: number;
}) => post<TableMerge>("/reservations/table-merges", data);

export const releaseTableMerge = (id: string) =>
  patch<TableMerge>(`/reservations/table-merges/${id}/release`, {});
