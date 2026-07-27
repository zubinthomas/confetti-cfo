// Role management (server/routes/roles.ts). Editing a role's permissions is
// clamped to what the editor themselves currently holds - same rule as
// invites/user management. GET is also used as a "start from a role" preset
// picker by the invite-creation form and the user-management edit modal.
import { get, post, patch, del } from "./http";
import type { Perm } from "./invitesApi";

export interface RoleWithPermissions {
  id: number;
  name: string;
  rank: number;
  permissions: Perm[];
  memberCount: number;
  system: boolean;
}

export const listRoles = () => get<RoleWithPermissions[]>("/roles");

export const createRole = (name: string, rank: number) =>
  post<RoleWithPermissions[]>("/roles", { name, rank });

export const setRoleRank = (id: number, rank: number) =>
  patch<RoleWithPermissions[]>(`/roles/${id}/rank`, { rank });

export const replaceRolePermissions = (id: number, permissions: Perm[]) =>
  patch<RoleWithPermissions[]>(`/roles/${id}/permissions`, { permissions });

export const deleteRole = (id: number) => del<{ ok: true }>(`/roles/${id}`);
