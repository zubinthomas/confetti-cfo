// Client for the public guest check-in endpoints. Not logged in: every call
// carries the on-site token from the QR link instead of a bearer token.
import { API_BASE, ApiError } from "./http";

const TOKEN_KEY = "checkin_token";
const SPOT_KEY = "checkin_spot";

export function rememberToken(fromUrl: string | null): string | null {
  try {
    if (fromUrl) sessionStorage.setItem(TOKEN_KEY, fromUrl);
    return fromUrl || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return fromUrl;
  }
}
export const savedSpotId = (): string | null => {
  try { return sessionStorage.getItem(SPOT_KEY); } catch { return null; }
};
export const saveSpotId = (id: string | null) => {
  try { id ? sessionStorage.setItem(SPOT_KEY, id) : sessionStorage.removeItem(SPOT_KEY); } catch { /* private mode */ }
};

export interface PublicArea { id: string; name: string; floor: string | null }
export interface PublicConfig { areas: PublicArea[]; maxPartySize: number; venueWhatsapp: string | null; shopUrl: string }
export type CheckStatus = "available" | "wait" | "long_wait" | "too_large";
export interface CheckResult {
  status: CheckStatus; minutes: number; joined: boolean;
  partiesAhead: number; tablesFree: number; tablesTotal: number;
}
export interface Spot {
  id: string; state: "waiting" | "ready" | "seated" | "left";
  position: number | null; quotedWaitMinutes: number | null; partySize: number; areaName: string | null;
}
export interface JoinResult { spot: Spot; check: CheckResult | null; existing: boolean }
export interface PublicMenuSection {
  id: string; name: string; areaId: string | null;
  items: { id: string; name: string; description: string; priceInr: number }[];
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/public/check-a-table${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Checkin-Token": token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.message || res.statusText, res.status, json);
  return json as T;
}

export const getConfig = (t: string) => call<PublicConfig>(t, "GET", "/config");
export const checkTable = (t: string, areaId: string, partySize: number) =>
  call<CheckResult>(t, "POST", "/check", { areaId, partySize });
export const joinList = (t: string, b: { areaId: string; partySize: number; phone: string; name?: string }) =>
  call<JoinResult>(t, "POST", "/join", b);
export const getSpot = (t: string, id: string) => call<Spot>(t, "GET", `/spot/${id}`);
export const leaveList = (t: string, id: string) => call<Spot>(t, "POST", `/spot/${id}/leave`);
export const getMenu = (t: string, areaId: string) =>
  call<PublicMenuSection[]>(t, "GET", `/menu?areaId=${encodeURIComponent(areaId)}`);
