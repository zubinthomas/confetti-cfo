// Account creation via invite: a user holding Invite:write picks an email
// and a set of permissions - clamped to their own current permissions,
// re-checked on every create/edit, never trusted from a stale invite row -
// generates a link, and the invitee sets a password to accept it. Combined
// with the CLI (db/users.ts), this is the only way accounts are created:
// there is no open self-registration path.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { getEffectivePermissions, type Resource, type Action } from './permissions.ts';

const INVITE_EXPIRY_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InviteError extends Error {}

export type Perm = { resource: Resource; action: Action };
type InviteRow = typeof schema.invites.$inferSelect;

export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) throw new InviteError(`"${email}" does not look like an email address`);
  return trimmed;
}

function isExpired(invite: { expiresAt: string }): boolean {
  return new Date(invite.expiresAt).getTime() < Date.now();
}

/** Throws if any of `wanted` isn't in the requesting user's own current
 *  effective permissions - live-checked, never trusted from a stale invite. */
async function assertGrantable(userId: number, wanted: Perm[]) {
  const held = new Set((await getEffectivePermissions(userId)).map((p) => `${p.resource}:${p.action}`));
  const missing = wanted.filter((p) => !held.has(`${p.resource}:${p.action}`));
  if (missing.length > 0) {
    throw new InviteError(`You don't hold these permissions yourself, so you can't grant them: ${missing.map((p) => `${p.resource}:${p.action}`).join(', ')}`);
  }
}

async function invitePermissionRows(inviteId: number) {
  return db.select({
    permissionId: schema.invitePermissions.permissionId,
    resource: schema.permissions.resource,
    action: schema.permissions.action,
  })
    .from(schema.invitePermissions)
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.invitePermissions.permissionId))
    .where(eq(schema.invitePermissions.inviteId, inviteId));
}

async function setInvitePermissions(inviteId: number, permissions: Perm[]) {
  const catalog = await db.select().from(schema.permissions);
  const byKey = new Map(catalog.map((r) => [`${r.resource}:${r.action}`, r.id]));
  const ids = permissions.map((p) => {
    const id = byKey.get(`${p.resource}:${p.action}`);
    if (id === undefined) throw new InviteError(`Unknown permission: ${p.resource}:${p.action}`);
    return id;
  });
  await db.delete(schema.invitePermissions).where(eq(schema.invitePermissions.inviteId, inviteId));
  for (const permissionId of ids) {
    await db.insert(schema.invitePermissions).values({ inviteId, permissionId });
  }
}

async function attachDetails(invite: InviteRow) {
  const [inviter] = await db.select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName })
    .from(schema.users).where(eq(schema.users.id, invite.invitedByUserId));
  const permissions = (await invitePermissionRows(invite.id)).map(({ resource, action }) => ({ resource, action }));
  return { ...invite, expired: isExpired(invite), invitedBy: inviter ?? null, permissions };
}

export async function listInvites() {
  await ready();
  const rows = await db.select().from(schema.invites).orderBy(desc(schema.invites.id));
  return Promise.all(rows.map(attachDetails));
}

export async function getInviteByToken(token: string) {
  await ready();
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  return invite ? attachDetails(invite) : null;
}

export async function createInvite(invitedByUserId: number, email: string, permissions: Perm[]) {
  await ready();
  const normalized = normalizeEmail(email);
  await assertGrantable(invitedByUserId, permissions);

  const [existingUser] = await db.select().from(schema.users).where(eq(schema.users.email, normalized));
  if (existingUser) throw new InviteError(`${normalized} already has an account`);

  const [existingInvite] = await db.select().from(schema.invites)
    .where(and(eq(schema.invites.email, normalized), eq(schema.invites.status, 'pending')));
  if (existingInvite && !isExpired(existingInvite)) {
    throw new InviteError(`${normalized} already has a pending invite - revoke it or edit its permissions instead`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const [invite] = await db.insert(schema.invites).values({
    email: normalized,
    token: randomBytes(32).toString('hex'),
    status: 'pending',
    invitedByUserId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }).returning();

  await setInvitePermissions(invite.id, permissions);
  return attachDetails(invite);
}

export async function updateInvitePermissions(id: number, requestingUserId: number, permissions: Perm[]) {
  await ready();
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.id, id));
  if (!invite) throw new InviteError('Invite not found');
  if (invite.status !== 'pending') throw new InviteError(`This invite is already ${invite.status}`);
  await assertGrantable(requestingUserId, permissions);

  await setInvitePermissions(id, permissions);
  return attachDetails(invite);
}

export async function revokeInvite(id: number) {
  await ready();
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.id, id));
  if (!invite) throw new InviteError('Invite not found');
  if (invite.status !== 'pending') throw new InviteError(`This invite is already ${invite.status}`);
  const [updated] = await db.update(schema.invites).set({ status: 'revoked' })
    .where(eq(schema.invites.id, id)).returning();
  return attachDetails(updated);
}

export async function acceptInvite(token: string, { fullName, password }: { fullName: string; password: string }) {
  await ready();
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token));
  if (!invite) throw new InviteError('Invite not found');
  if (invite.status !== 'pending') throw new InviteError('This invite has already been used or revoked');
  if (isExpired(invite)) throw new InviteError('This invite has expired');
  if (password.length < 8) throw new InviteError('Password must be at least 8 characters');

  const [existingUser] = await db.select().from(schema.users).where(eq(schema.users.email, invite.email));
  if (existingUser) throw new InviteError(`${invite.email} already has an account`);

  const passwordHash = await bcrypt.hash(password, 10);
  const grants = await invitePermissionRows(invite.id);
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({
      email: invite.email,
      passwordHash,
      fullName: fullName.trim() || null,
      createdAt: now,
    }).returning();
    for (const { permissionId } of grants) {
      await tx.insert(schema.userPermissions).values({ userId: user.id, permissionId, effect: 'allow' });
    }
    await tx.update(schema.invites).set({
      status: 'accepted', acceptedAt: now, acceptedUserId: user.id,
    }).where(eq(schema.invites.id, invite.id));
    return user;
  });
}
