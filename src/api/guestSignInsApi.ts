// Guest sign-in register (server/routes/guestSignIns.ts) - Sienna's digital
// arrivals book. Sits beside reservations on the Reservations page and shares
// the `Reservation` permission. A coded 409 from assign-table
// (reservation_clash | table_occupied | over_capacity) surfaces as an ApiError
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
  areaId: string | null;
  areaName: string | null;
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
  sortOrder: number;
  quotedWaitMinutes: number | null;
  notifiedAt: string | null;
  notifiedVia: string | null;
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
  areaId?: string | null;
  reservationId?: string | null;
  signedInAt?: string;
  notes?: string;
  quotedWaitMinutes?: number;
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

export const listSignIns = (
  params: { date?: string; areaId?: string; onPremisesOnly?: boolean; unseatedOnly?: boolean } = {},
) => {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.areaId) query.set("areaId", params.areaId);
  if (params.onPremisesOnly) query.set("onPremisesOnly", "true");
  if (params.unseatedOnly) query.set("unseatedOnly", "true");
  const qs = query.toString();
  return get<GuestSignIn[]>(`/guest-sign-ins${qs ? `?${qs}` : ""}`);
};

export interface SignInPage { rows: GuestSignIn[]; total: number }

/** One page of register entries across all days, newest first. `from`/`to` are inclusive IST dates;
 *  `state` defaults to signed-out entries on the server. */
export const listSignInPage = (params: {
  from?: string; to?: string; areaId?: string; tableId?: string; visitType?: GuestVisitType | "";
  q?: string; state?: "signedOut" | "onPremises"; limit?: number; offset?: number;
} = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return get<SignInPage>(`/guest-sign-ins/all${qs ? `?${qs}` : ""}`);
};

export const estimateWait = (params: { areaId?: string; partySize: number }) => {
  const query = new URLSearchParams();
  if (params.areaId) query.set("areaId", params.areaId);
  query.set("partySize", String(params.partySize));
  return get<{ minutes: number | null }>(`/guest-sign-ins/estimate?${query.toString()}`);
};

export const createSignIn = (data: CreateSignInPayload) =>
  post<GuestSignIn>("/guest-sign-ins", data);

export const updateSignIn = (
  id: string,
  data: Partial<Pick<CreateSignInPayload, "guestName" | "visitType" | "guestPhone" | "guestEmail" | "partySize" | "purpose" | "host" | "notes" | "areaId">>,
) => patch<GuestSignIn>(`/guest-sign-ins/${id}`, data);

export const assignTable = (
  id: string,
  data: { tableId: string | null; expectedUntil?: string },
) => patch<GuestSignIn>(`/guest-sign-ins/${id}/assign-table`, data);

export const extendSignIn = (id: string, minutes: number) =>
  patch<GuestSignIn>(`/guest-sign-ins/${id}/extend`, { minutes });

export const signOutGuest = (id: string) =>
  patch<GuestSignIn>(`/guest-sign-ins/${id}/sign-out`, {});

export const notifyGuest = (id: string, notifiedVia?: string) =>
  patch<GuestSignIn>(`/guest-sign-ins/${id}/notify`, { notifiedVia });

export const reorderSignIn = (id: string, direction: "up" | "down") =>
  patch<GuestSignIn>(`/guest-sign-ins/${id}/reorder`, { direction });

export const deleteSignIn = (id: string) => del(`/guest-sign-ins/${id}`);
