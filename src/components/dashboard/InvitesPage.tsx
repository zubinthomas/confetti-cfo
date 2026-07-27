import React, { useEffect, useMemo, useState } from "react";
import DashCard from "./DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/AuthContext";
import {
  listInvites, createInvite, updateInvitePermissions, revokeInvite,
  type Invite, type Perm, type PermissionAction,
} from "@/api/invitesApi";
import { listRoles, type RoleWithPermissions } from "@/api/rolesApi";
import { Loader2, Plus, X, Copy, Check } from "lucide-react";

const ACTIONS: PermissionAction[] = ["read", "write", "delete"];
const key = (resource: string, action: string) => `${resource}:${action}`;

const STATUS_STYLE: Record<Invite["status"], string> = {
  pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  revoked: "bg-muted text-muted-foreground",
};

/** Checkbox grid: resources x read/write/delete. `heldPerms` (the current
 *  user's own permissions) render as normal editable checkboxes - nothing
 *  else is even shown, since nothing else could be granted anyway.
 *  `lockedPerms` (already on the invite, from before, but not held by the
 *  current user) render checked-and-disabled, so an editor without a given
 *  permission can neither grant it nor silently strip it by saving. */
function PermissionMatrix({
  heldPerms, lockedPerms, checked, onToggle,
}: {
  heldPerms: Set<string>;
  lockedPerms: Set<string>;
  checked: Set<string>;
  onToggle: (k: string) => void;
}) {
  const allKeys = useMemo(() => new Set([...heldPerms, ...lockedPerms]), [heldPerms, lockedPerms]);
  const resources = useMemo(() => {
    const set = new Set<string>();
    for (const k of allKeys) set.add(k.split(":")[0]);
    return [...set].sort();
  }, [allKeys]);

  if (resources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't hold any permissions yourself, so there's nothing you can invite someone else into.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground border-b border-border text-xs">
          <th className="py-1.5 pr-3 font-medium">Resource</th>
          {ACTIONS.map((a) => (
            <th key={a} className="py-1.5 px-2 font-medium text-center capitalize">{a}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {resources.map((resource) => (
          <tr key={resource} className="border-b border-border last:border-0">
            <td className="py-1.5 pr-3 text-foreground">{resource}</td>
            {ACTIONS.map((action) => {
              const k = key(resource, action);
              if (!allKeys.has(k)) {
                return <td key={action} className="py-1.5 px-2 text-center text-muted-foreground/30">–</td>;
              }
              const locked = lockedPerms.has(k) && !heldPerms.has(k);
              return (
                <td key={action} className="py-1.5 px-2 text-center">
                  <input
                    type="checkbox"
                    checked={checked.has(k)}
                    disabled={locked}
                    onChange={() => onToggle(k)}
                    title={locked ? "Granted by someone else - you don't hold this permission yourself, so you can't change it here" : undefined}
                    className="accent-primary disabled:opacity-50"
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InviteFormModal({
  invite, roles, heldPerms, onClose, onSaved,
}: {
  invite: Invite | null; // null = creating a new invite
  roles: RoleWithPermissions[];
  heldPerms: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(invite?.email ?? "");
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set((invite?.permissions ?? []).map((p) => key(p.resource, p.action))),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const lockedPerms = useMemo(() => {
    const set = new Set<string>();
    for (const p of invite?.permissions ?? []) {
      const k = key(p.resource, p.action);
      if (!heldPerms.has(k)) set.add(k);
    }
    return set;
  }, [invite, heldPerms]);

  const toggle = (k: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const applyRole = (roleId: string) => {
    const role = roles.find((r) => String(r.id) === roleId);
    if (!role) return;
    setChecked((prev) => {
      const next = new Set(prev);
      for (const p of role.permissions) {
        const k = key(p.resource, p.action);
        if (heldPerms.has(k)) next.add(k);
      }
      return next;
    });
  };

  const save = async () => {
    setError("");
    if (!invite && !email.trim()) { setError("Email is required"); return; }
    setSaving(true);
    try {
      const permissions: Perm[] = [...checked].map((k) => {
        const [resource, action] = k.split(":");
        return { resource, action: action as PermissionAction };
      });
      if (invite) await updateInvitePermissions(invite.id, permissions);
      else await createInvite(email.trim(), permissions);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invite");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {invite ? "Edit invite permissions" : "Invite someone"}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          {!invite && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com" autoFocus
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          )}
          {roles.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Start from a role (optional)</label>
              <select
                defaultValue=""
                onChange={(e) => { applyRole(e.target.value); e.target.value = ""; }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                <option value="" disabled>Pick a role to check its boxes below…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Permissions</p>
            <PermissionMatrix heldPerms={heldPerms} lockedPerms={lockedPerms} checked={checked} onToggle={toggle} />
            <p className="text-[11px] text-muted-foreground mt-2">
              Only permissions you hold yourself can be adjusted. A role is just a shortcut to check boxes -
              the invite itself only ever stores the exact permissions checked here.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={save} disabled={saving}
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {invite ? "Save" : "Create invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/invite/${token}`;
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1 text-xs text-primary hover:underline" title={url}
    >
      {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy link</>}
    </button>
  );
}

export default function InvitesPage() {
  const { user, can } = useAuth();
  const canWrite = can("Invite", "write");
  const canDelete = can("Invite", "delete");
  const heldPerms = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [error, setError] = useState("");
  const [formInvite, setFormInvite] = useState<Invite | null | undefined>(undefined); // undefined = closed
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);
  const [revoking, setRevoking] = useState(false);

  const refresh = () => { listInvites().then(setInvites).catch((err: Error) => setError(err.message)); };
  useEffect(() => {
    refresh();
    if (canWrite) listRoles().then(setRoles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  const onRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeInvite(revokeTarget.id);
      setRevokeTarget(null);
      refresh();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Invites</p>
        {canWrite && (
          <button
            onClick={() => setFormInvite(null)}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> Invite someone
          </button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DashCard title="Invites">
        {!invites ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No invites yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Email</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Permissions</th>
                  <th className="text-left py-2 pr-4 font-medium">Invited by</th>
                  <th className="text-left py-2 pr-4 font-medium">Expires</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{inv.email}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[inv.status]}`}>
                        {inv.status === "pending" && inv.expired ? "expired" : inv.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {inv.permissions.length === 0 ? "-" : `${inv.permissions.length} permission${inv.permissions.length === 1 ? "" : "s"}`}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {inv.invitedBy?.fullName || inv.invitedBy?.email || "-"}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-3">
                        {inv.status === "pending" && !inv.expired && <InviteLink token={inv.token} />}
                        {inv.status === "pending" && !inv.expired && canWrite && (
                          <button onClick={() => setFormInvite(inv)} className="text-xs text-primary hover:underline">Edit</button>
                        )}
                        {inv.status === "pending" && canDelete && (
                          <button onClick={() => setRevokeTarget(inv)} className="text-xs text-red-500 hover:underline">Revoke</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {formInvite !== undefined && (
        <InviteFormModal
          invite={formInvite}
          roles={roles}
          heldPerms={heldPerms}
          onClose={() => setFormInvite(undefined)}
          onSaved={() => { setFormInvite(undefined); refresh(); }}
        />
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title="Revoke this invite?"
        description={revokeTarget ? `"${revokeTarget.email}" won't be able to use this link anymore. This can't be undone.` : ""}
        confirmLabel="Revoke"
        destructive
        loading={revoking}
        onConfirm={onRevoke}
      />
    </div>
  );
}
