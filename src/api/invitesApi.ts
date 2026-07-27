// Invite calls against the Express server (server/routes/invites.ts).
// Accounts are created via the CLI or by accepting an invite - there is no
// open self-registration path.
import { get, post, patch, del } from "./http";

export type PermissionAction = "read" | "write" | "delete";
export interface Perm { resource: string; action: PermissionAction }

export interface Invite {
  id: number;
  email: string;
  token: string;
  status: "pending" | "accepted" | "revoked";
  expired: boolean;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy: { id: number; email: string; fullName: string | null } | null;
  permissions: Perm[];
}

export const listInvites = () => get<Invite[]>("/invites");

export const createInvite = (email: string, permissions: Perm[]) =>
  post<Invite>("/invites", { email, permissions });

export const updateInvitePermissions = (id: number, permissions: Perm[]) =>
  patch<Invite>(`/invites/${id}`, { permissions });

export const revokeInvite = (id: number) => del<Invite>(`/invites/${id}`);

export interface PublicInviteInfo {
  email: string;
  invitedBy: { fullName: string | null; email: string } | null;
  permissions: Perm[];
  expiresAt: string;
}

// These two are called before the invitee has any account/token - the
// shared http.ts request() wrapper still attaches an Authorization header if
// one happens to be in localStorage, but the server never checks it here.
export const getPublicInvite = (token: string) => get<PublicInviteInfo>(`/invites/public/${token}`);

export const acceptInvite = (token: string, data: { fullName: string; password: string }) =>
  post<{ access_token: string }>(`/invites/public/${token}/accept`, data);
