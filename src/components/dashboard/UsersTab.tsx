import React, { useEffect, useState } from "react";
import DashCard from "./DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import PermissionMatrix, { permKey as key } from "@/components/PermissionMatrix";
import { useAuth } from "@/lib/AuthContext";
import {
  listUsers, getUser, setUserActive, replaceUserRoles, replaceUserPermissions, replaceUserDivisionScope,
  type UserListItem, type UserDetail,
} from "@/api/usersApi";
import type { RoleWithPermissions } from "@/api/rolesApi";
import type { PermissionAction } from "@/api/invitesApi";
import { DIVISIONS } from "@/lib/hrDivisions";
import { Loader2, X } from "lucide-react";

const roleFullyHeld = (role: RoleWithPermissions, heldPerms: Set<string>) =>
  role.permissions.every((p) => heldPerms.has(key(p.resource, p.action)));

function EditUserModal({
  target, roles, heldPerms, onClose, onSaved,
}: {
  target: UserDetail;
  roles: RoleWithPermissions[];
  heldPerms: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roleIds, setRoleIds] = useState<Set<number>>(() => new Set(target.roles.map((r) => r.id)));
  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(
    () => new Set(target.directPermissions.map((p) => key(p.resource, p.action))),
  );
  const [divisionScope, setDivisionScope] = useState<Set<string>>(() => new Set(target.divisionScope));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A role the target already has, but whose full permission set the editor
  // doesn't hold, is locked - preserved untouched, not offered as removable.
  const roleLockedIds = React.useMemo(() => new Set(
    target.roles
      .filter((r) => {
        const full = roles.find((x) => x.id === r.id);
        return full ? !roleFullyHeld(full, heldPerms) : true;
      })
      .map((r) => r.id),
  ), [target, roles, heldPerms]);

  const assignableRoles = React.useMemo(
    () => roles.filter((r) => roleFullyHeld(r, heldPerms) || roleLockedIds.has(r.id)),
    [roles, heldPerms, roleLockedIds],
  );

  const toggleRole = (id: number) => {
    if (roleLockedIds.has(id)) return;
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const lockedPerms = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of target.directPermissions) {
      const k = key(p.resource, p.action);
      if (!heldPerms.has(k)) set.add(k);
    }
    return set;
  }, [target, heldPerms]);

  const togglePerm = (k: string) => setCheckedPerms((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const toggleDivision = (d: string) => setDivisionScope((prev) => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    return next;
  });

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const permissions = [...checkedPerms].map((k) => {
        const [resource, action] = k.split(":");
        return { resource, action: action as PermissionAction };
      });
      await Promise.all([
        replaceUserRoles(target.id, [...roleIds]),
        replaceUserPermissions(target.id, permissions),
        replaceUserDivisionScope(target.id, [...divisionScope]),
      ]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">{target.fullName || target.email}</h2>
            <p className="text-xs text-muted-foreground">{target.email}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Roles</p>
            {assignableRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles you can assign.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignableRoles.map((r) => {
                  const locked = roleLockedIds.has(r.id);
                  const checked = roleIds.has(r.id);
                  return (
                    <label
                      key={r.id}
                      title={locked ? "Assigned by someone else - you don't hold this role's full permission set, so you can't change it here" : undefined}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border select-none ${
                        checked ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                      } ${locked ? "opacity-60" : "cursor-pointer"}`}
                    >
                      <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleRole(r.id)} className="accent-primary" />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Direct permissions</p>
            <PermissionMatrix heldPerms={heldPerms} lockedPerms={lockedPerms} checked={checkedPerms} onToggle={togglePerm} />
            <p className="text-[11px] text-muted-foreground mt-2">
              Only roles/permissions you hold yourself can be adjusted here.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Division scope</p>
            <div className="flex flex-wrap gap-2">
              {DIVISIONS.map((d) => {
                const checked = divisionScope.has(d);
                return (
                  <label
                    key={d}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer select-none ${
                      checked ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleDivision(d)} className="accent-primary" />
                    {d}
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Restricts this user's Employee/Licence/Recruitment/Leave access to the checked divisions only.
              Leave everything unchecked for unrestricted access (the default).
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
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersTab({ roles, heldPerms }: { roles: RoleWithPermissions[]; heldPerms: Set<string> }) {
  const { user, can } = useAuth();
  const canWrite = can("User", "write");
  const canDelete = can("User", "delete");

  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [error, setError] = useState("");
  const [editTarget, setEditTarget] = useState<UserDetail | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<number | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserListItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = () => { listUsers().then(setUsers).catch((err: Error) => setError(err.message)); };
  useEffect(() => { refresh(); }, []);

  const openEdit = async (id: number) => {
    setEditLoadingId(id);
    try {
      setEditTarget(await getUser(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setEditLoadingId(null);
    }
  };

  const reactivate = async (id: number) => {
    setBusyId(id);
    try {
      await setUserActive(id, true);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const onDeactivate = async () => {
    if (!deactivateTarget) return;
    setBusyId(deactivateTarget.id);
    try {
      await setUserActive(deactivateTarget.id, false);
      setDeactivateTarget(null);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <DashCard title="Users">
        {!users ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Email</th>
                  <th className="text-left py-2 pr-4 font-medium">Name</th>
                  <th className="text-left py-2 pr-4 font-medium">Roles</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Created</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4 font-medium text-foreground">
                        {u.email}
                        {isSelf && <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">(you)</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{u.fullName || "-"}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0
                            ? <span className="text-xs text-muted-foreground">-</span>
                            : u.roles.map((r) => (
                              <span key={r.id} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{r.name}</span>
                            ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                          u.active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {u.active ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5">
                        {!isSelf && (
                          <div className="flex items-center gap-3">
                            {canWrite && (
                              <button
                                onClick={() => openEdit(u.id)} disabled={editLoadingId === u.id}
                                className="text-xs text-primary hover:underline disabled:opacity-50"
                              >
                                {editLoadingId === u.id ? "Loading…" : "Edit"}
                              </button>
                            )}
                            {u.active
                              ? canDelete && (
                                <button
                                  onClick={() => setDeactivateTarget(u)} disabled={busyId === u.id}
                                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                                >
                                  Deactivate
                                </button>
                              )
                              : canWrite && (
                                <button
                                  onClick={() => reactivate(u.id)} disabled={busyId === u.id}
                                  className="text-xs text-emerald-600 hover:underline disabled:opacity-50"
                                >
                                  Reactivate
                                </button>
                              )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {editTarget && (
        <EditUserModal
          target={editTarget}
          roles={roles}
          heldPerms={heldPerms}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); refresh(); }}
        />
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
        title="Deactivate this user?"
        description={deactivateTarget ? `"${deactivateTarget.email}" will be logged out immediately and won't be able to sign in until reactivated.` : ""}
        confirmLabel="Deactivate"
        destructive
        loading={busyId === deactivateTarget?.id}
        onConfirm={onDeactivate}
      />
    </>
  );
}
