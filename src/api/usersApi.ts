// User account management (server/routes/users.ts). Editing an existing
// user's roles/direct permissions is clamped to what the editor themselves
// currently holds - same rule as invites - and self-edit is blocked outright
// server-side, not just hidden client-side.
import { get, patch } from "./http";
import type { Perm } from "./invitesApi";

export interface Role {
  id: number;
  name: string;
  rank: number;
}

export interface UserListItem {
  id: number;
  email: string;
  fullName: string | null;
  active: boolean;
  createdAt: string;
  roles: Role[];
  divisionScope: string[]; // empty = unrestricted; see src/lib/hrDivisions.ts
}

export interface UserDetail extends UserListItem {
  directPermissions: Perm[];
}

export const listUsers = () => get<UserListItem[]>("/users");

export const getUser = (id: number) => get<UserDetail>(`/users/${id}`);

export const setUserActive = (id: number, active: boolean) =>
  patch<UserDetail>(`/users/${id}/active`, { active });

export const replaceUserRoles = (id: number, roleIds: number[]) =>
  patch<UserDetail>(`/users/${id}/roles`, { roleIds });

export const replaceUserPermissions = (id: number, permissions: Perm[]) =>
  patch<UserDetail>(`/users/${id}/permissions`, { permissions });

export const replaceUserDivisionScope = (id: number, divisions: string[]) =>
  patch<UserDetail>(`/users/${id}/division-scope`, { divisions });
