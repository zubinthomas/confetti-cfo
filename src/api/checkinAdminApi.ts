// Staff side of guest self check-in and its menu (server/routes/checkinAdmin.ts
// and menuAdmin.ts, under /api/restaurant).
import { get, post, put, patch, del } from "./http";

export interface CheckinSettings {
  enabled: boolean;
  token: string;
  bookingBufferMinutes: number;
  minutesPerParty: number;
  maxPartySize: number;
  maxWaitMinutes: number;
  venueWhatsapp: string | null;
  shopUrl: string;
  updatedAt: string;
}
export type CheckinPatch = Partial<Omit<CheckinSettings, "token" | "updatedAt">>;

export const getCheckinSettings = () => get<CheckinSettings>("/restaurant/checkin-settings");
export const updateCheckinSettings = (b: CheckinPatch) => patch<CheckinSettings>("/restaurant/checkin-settings", b);
export const rotateCheckinToken = () => post<CheckinSettings>("/restaurant/checkin-settings/rotate-token");
export const setCheckinAreas = (areaIds: string[]) => put<{ message: string }>("/restaurant/checkin-settings/areas", { areaIds });

export interface MenuItem {
  id: string; sectionId: string; name: string; description: string | null; priceInr: number; sortOrder: number; available: boolean;
}
export interface MenuSection {
  id: string; areaId: string | null; name: string; sortOrder: number; archivedAt: string | null; items: MenuItem[];
}

export const listMenu = () => get<MenuSection[]>("/restaurant/menu");
export const createMenuSection = (b: { name: string; areaId: string | null }) => post<MenuSection>("/restaurant/menu/sections", b);
export const updateMenuSection = (id: string, b: { name?: string; areaId?: string | null; archived?: boolean }) =>
  patch<MenuSection>(`/restaurant/menu/sections/${id}`, b);
export const deleteMenuSection = (id: string) => del(`/restaurant/menu/sections/${id}`);
export const reorderMenuSections = (ids: string[]) => put("/restaurant/menu/sections/order", { ids });
export const createMenuItem = (sectionId: string, b: { name: string; description?: string; priceInr: number; available?: boolean }) =>
  post<MenuItem>(`/restaurant/menu/sections/${sectionId}/items`, b);
export const updateMenuItem = (id: string, b: { name?: string; description?: string; priceInr?: number; available?: boolean }) =>
  patch<MenuItem>(`/restaurant/menu/items/${id}`, b);
export const deleteMenuItem = (id: string) => del(`/restaurant/menu/items/${id}`);
export const reorderMenuItems = (ids: string[]) => put("/restaurant/menu/items/order", { ids });
