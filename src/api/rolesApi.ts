// Read-only role listing (server/routes/roles.ts) - used only as a "start
// from a role" preset picker in the invite-creation form. Full role
// management stays CLI-only.
import { get } from "./http";
import type { Perm } from "./invitesApi";

export interface RoleWithPermissions {
  id: number;
  name: string;
  rank: number;
  permissions: Perm[];
}

export const listRoles = () => get<RoleWithPermissions[]>("/roles");
