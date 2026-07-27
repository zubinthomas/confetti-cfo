import React, { useEffect, useMemo, useState } from "react";
import DashCard from "./DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import PermissionMatrix, { permKey as key } from "@/components/PermissionMatrix";
import { useAuth } from "@/lib/AuthContext";
import {
  listRoles, createRole, setRoleRank, replaceRolePermissions, deleteRole,
  type RoleWithPermissions,
} from "@/api/rolesApi";
import { Loader2, Plus, X } from "lucide-react";

function RoleFormModal({
  role, heldPerms, onClose, onSaved,
}: {
  role: RoleWithPermissions | null; // null = creating a new role
  heldPerms: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [rank, setRank] = useState(String(role?.rank ?? ""));
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set((role?.permissions ?? []).map((p) => key(p.resource, p.action))),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const lockedPerms = useMemo(() => {
    const set = new Set<string>();
    for (const p of role?.permissions ?? []) {
      const k = key(p.resource, p.action);
      if (!heldPerms.has(k)) set.add(k);
    }
    return set;
  }, [role, heldPerms]);

  const toggle = (k: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const save = async () => {
    setError("");
    const rankNum = Number(rank);
    if (!role && !name.trim()) { setError("Name is required"); return; }
    if (!Number.isInteger(rankNum)) { setError("Rank must be a whole number"); return; }
    setSaving(true);
    try {
      if (role) {
        const permissions = [...checked].map((k) => {
          const [resource, action] = k.split(":");
          return { resource, action: action as "read" | "write" | "delete" };
        });
        await Promise.all([
          rankNum !== role.rank ? setRoleRank(role.id, rankNum) : Promise.resolve(),
          replaceRolePermissions(role.id, permissions),
        ]);
      } else {
        await createRole(name.trim(), rankNum);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {role ? `Edit ${role.name}` : "New role"}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                disabled={!!role} autoFocus={!role}
                placeholder="e.g. Store Manager"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm disabled:opacity-60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Rank</label>
              <input
                type="number" value={rank} onChange={(e) => setRank(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Higher rank wins when a user holds multiple roles that disagree on the same permission.
          </p>

          {role && (
            <div>
              {role.system && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-lg mb-2">
                  "{role.name}" is a built-in role - its permissions are reset to the default on every server restart, so edits made here only last until then.
                </p>
              )}
              <p className="text-xs font-medium text-muted-foreground mb-2">Permissions</p>
              <PermissionMatrix heldPerms={heldPerms} lockedPerms={lockedPerms} checked={checked} onToggle={toggle} />
              <p className="text-[11px] text-muted-foreground mt-2">
                Only permissions you hold yourself can be adjusted here.
              </p>
            </div>
          )}
          {!role && (
            <p className="text-xs text-muted-foreground">
              New roles start with no permissions - grant them by editing the role after it's created.
            </p>
          )}
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
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {role ? "Save" : "Create role"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const { user, can } = useAuth();
  const canWrite = can("Role", "write");
  const canDelete = can("Role", "delete");
  const heldPerms = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const [roles, setRoles] = useState<RoleWithPermissions[] | null>(null);
  const [error, setError] = useState("");
  const [formRole, setFormRole] = useState<RoleWithPermissions | null | undefined>(undefined); // undefined = closed
  const [deleteTarget, setDeleteTarget] = useState<RoleWithPermissions | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const refresh = () => { listRoles().then(setRoles).catch((err: Error) => setError(err.message)); };
  useEffect(() => { refresh(); }, []);

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteRole(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Roles</p>
        {canWrite && (
          <button
            onClick={() => setFormRole(null)}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> New role
          </button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DashCard title="Roles">
        {!roles ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Name</th>
                  <th className="text-left py-2 pr-4 font-medium">Rank</th>
                  <th className="text-left py-2 pr-4 font-medium">Permissions</th>
                  <th className="text-left py-2 pr-4 font-medium">Members</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const deleteBlockedReason = r.system
                    ? "Built-in role - can't be deleted"
                    : r.memberCount > 0
                      ? `Still assigned to ${r.memberCount} user${r.memberCount === 1 ? "" : "s"} - unassign first`
                      : undefined;
                  return (
                    <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4 font-medium text-foreground">
                        {r.name}
                        {r.system && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">System</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{r.rank}</td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {r.permissions.length === 0 ? "-" : `${r.permissions.length} permission${r.permissions.length === 1 ? "" : "s"}`}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {r.memberCount === 0 ? "-" : `${r.memberCount} user${r.memberCount === 1 ? "" : "s"}`}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-3">
                          {canWrite && (
                            <button onClick={() => setFormRole(r)} className="text-xs text-primary hover:underline">Edit</button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(r)}
                              disabled={!!deleteBlockedReason}
                              title={deleteBlockedReason}
                              className="text-xs text-red-500 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {formRole !== undefined && (
        <RoleFormModal
          role={formRole}
          heldPerms={heldPerms}
          onClose={() => setFormRole(undefined)}
          onSaved={() => { setFormRole(undefined); refresh(); }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(""); } }}
        title="Delete this role?"
        description={deleteError || (deleteTarget ? `"${deleteTarget.name}" will be permanently removed. This can't be undone.` : "")}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
