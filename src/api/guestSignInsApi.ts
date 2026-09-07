// Guest sign-in register (server/routes/guestSignIns.ts) - Sienna's digital
// arrivals book. Sits beside reservations on the Reservations page and shares
// the `Reservation` permission. A coded 409 from assign-table
// (reservation_clash | merge_prompt | over_capacity) surfaces as an ApiError
// whose .data.code / .data.detail the UI branches on.
import { get, post, patch, del } from "./http";

export type GuestVisitType = "walk_in" | "event";

export interface GuestSignIn {
  id: string;
  createdDate: string;
  visitType: GuestVisitType;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  purpose: string | null;
  host: string | null;
  locationId: string | null;
  locationName: string | null;
  tableId: string | null;
  tableName: string | null;
  tableCapacity: number | null;
  tableMaxExtraCapacity: number | null;
  reservationId: string | null;
  reservationTime: string | null;
  reservationGuestName: string | null;
  reservationStatus: string | null;
  signedInAt: string;
  seatedAt: string | null;
  expectedUntil: string | null;
  signedOutAt: string | null;
  notes: string | null;
  createdByUserId: number | null;
}

export interface CreateSignInPayload {
  guestName: string;
  visitType?: GuestVisitType;
  guestPhone?: string;
  guestEmail?: string;
  partySize?: number;
  purpose?: string;
  host?: string;
  locationId?: string | null;
  reservationId?: string | null;
  signedInAt?: string;
  notes?: string;
}

export interface AssignTableClashDetail {
  reservationId?: string;
  reservationTime?: string;
  tableName?: string;
  occupants?: number;
  partySize?: number;
  capacity?: number;
  combined?: number;
}

export const listSignIns = (params: { date?: string; locationId?: string; onPremisesOnly?: boolean } = {}) => {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.locationId) query.set("locationId", params.locationId);
  if (params.onPremisesOnly) query.set("onPremisesOnly", "true");
  const qs = query.toString();
  return get<GuestSignIn[]>(`/guest-sign-ins${qs ? `?${qs}` : ""}`);
};

export const createSignIn = (data: CreateSignInPayload) =>
  post<GuestSignIn>("/guest-sign-ins", data);

export const updateSignIn = (
  id: string,
  data: Partial<Pick<CreateSignInPayload, "guestName" | "visitType" | "guestPhone" | "guestEmail" | "partySize" | "purpose" | "host" | "notes" | "locationId">>,
) => patch<GuestSignIn>(`/guest-sign-ins/${id}`, data);

export const assignTable = (
  id: string,
  data: { tableId: string | null; expectedUntil?: string; acknowledgeMerge?: boolean },
) => patch<GuestSignIn>(`/guest-sign-ins/${id}/assign-table`, data);

export const extendSignIn = (id: string, minutes: number) =>
  patch<GuestSignIn>(`/guest-sign-ins/${id}/extend`, { minutes });

export const signOutGuest = (id: string) =>
  patch<GuestSignIn>(`/guest-sign-ins/${id}/sign-out`, {});

export const deleteSignIn = (id: string) => del(`/guest-sign-ins/${id}`);
