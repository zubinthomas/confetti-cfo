// Layout management (server/routes/layouts.ts). Saving your own layout needs no
// permission; role and permission layouts need Layout:write, and resetting
// another user's needs User:write.
import { get, put, del } from "./http";
import type { LayoutConfig } from "@/lib/layout/types";

export interface RoleLayoutEntry {
  roleId: number;
  roleName: string;
  rank: number;
  config: LayoutConfig;
  updatedAt: string;
}

export interface PermissionLayoutEntry {
  resource: string;
  action: string;
  priority: number;
  config: LayoutConfig;
  updatedAt: string;
}

export const listLayouts = () =>
  get<{ roles: RoleLayoutEntry[]; permissions: PermissionLayoutEntry[] }>("/layouts");

export const saveOwnLayout = (config: LayoutConfig) =>
  put<{ config: LayoutConfig }>("/layouts/me", { config });

export const resetOwnLayout = () => del<{ ok: true }>("/layouts/me");

export const saveRoleLayout = (roleId: number, config: LayoutConfig) =>
  put<{ config: LayoutConfig }>(`/layouts/roles/${roleId}`, { config });

export const clearRoleLayout = (roleId: number) => del<{ ok: true }>(`/layouts/roles/${roleId}`);

export const savePermissionLayout = (resource: string, action: string, priority: number, config: LayoutConfig) =>
  put<{ config: LayoutConfig }>(`/layouts/permissions/${resource}/${action}`, { priority, config });

export const clearPermissionLayout = (resource: string, action: string) =>
  del<{ ok: true }>(`/layouts/permissions/${resource}/${action}`);

export const resetUserLayout = (userId: number) => del<{ ok: true }>(`/layouts/users/${userId}`);
