import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashCard from "./DashCard";
import LayoutEditor, { type LayoutPreset } from "@/components/layout-editor/LayoutEditor";
import { useAuth } from "@/lib/AuthContext";
import { listRoles, type RoleWithPermissions } from "@/api/rolesApi";
import {
  clearPermissionLayout, clearRoleLayout, listLayouts, savePermissionLayout, saveRoleLayout,
  type PermissionLayoutEntry, type RoleLayoutEntry,
} from "@/api/layoutsApi";
import type { CanFn, LayoutConfig } from "@/lib/layout/types";
import leadershipPreset from "@/lib/layout/presets/leadership.json";

type Scope = "role" | "permission";

const PRESETS: LayoutPreset[] = [{ label: "Apply Leadership preset", config: leadershipPreset as LayoutConfig }];
const DEFAULT_PRIORITY = 100;

const permLabel = (resource: string, action: string) => `${resource}:${action}`;

/** Admin editor for role and permission layouts. Per-user layouts are not
 *  authored here (people arrange their own); resetting one is on the Users tab. */
export default function LayoutsTab({ heldPerms }: { heldPerms: Set<string> }) {
  const { can } = useAuth();
  const canWrite = can("Layout", "write");

  const [layouts, setLayouts] = useState<{ roles: RoleLayoutEntry[]; permissions: PermissionLayoutEntry[] } | null>(null);
  const [roles, setRoles] = useState<RoleWithPermissions[] | null>(null);
  const [rolesNote, setRolesNote] = useState("");
  const [error, setError] = useState("");

  const [scope, setScope] = useState<Scope>("role");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [permission, setPermission] = useState<string>("");
  const [priority, setPriority] = useState<number>(DEFAULT_PRIORITY);

  const refresh = useCallback(async () => {
    try {
      setLayouts(await listLayouts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load layouts");
    }
  }, []);
  useEffect(() => {
    refresh();
    // Listing roles needs Role:read (or Invite/User write); a layout-only admin
    // can still edit the roles that already have a layout.
    listRoles().then(setRoles).catch(() => setRolesNote("Listing every role needs the Role:read permission. Only roles that already have a layout can be edited here."));
  }, [refresh]);

  // Roles to pick from: all of them when we can list them, otherwise the ones with a layout.
  const roleOptions = useMemo(() => {
    if (roles) return roles.map((r) => ({ id: r.id, name: r.name, rank: r.rank }));
    return (layouts?.roles ?? []).map((r) => ({ id: r.roleId, name: r.roleName, rank: r.rank }));
  }, [roles, layouts]);

  // Permissions to pick from: everything the admin holds plus whatever already has a layout.
  const permissionOptions = useMemo(() => {
    const keys = new Set(heldPerms);
    for (const p of layouts?.permissions ?? []) keys.add(permLabel(p.resource, p.action));
    return [...keys].sort();
  }, [heldPerms, layouts]);

  const roleEntry = layouts?.roles.find((r) => r.roleId === roleId) ?? null;
  const permEntry = layouts?.permissions.find((p) => permLabel(p.resource, p.action) === permission) ?? null;
  const role = roles?.find((r) => r.id === roleId) ?? null;

  // Picking a permission that already has a layout loads its saved priority.
  useEffect(() => { setPriority(permEntry?.priority ?? DEFAULT_PRIORITY); }, [permEntry?.priority, permission]);

  // For a role, items the role can't open are left out of the editor (the same
  // hard filter its members get). A permission layout applies to whoever holds
  // the permission, so every item is offered and the viewers' own access still decides.
  const roleCan = useMemo<CanFn>(() => {
    const held = new Set((role?.permissions ?? []).map((p) => permLabel(p.resource, p.action)));
    return (resource, action) => held.has(permLabel(resource, action));
  }, [role]);
  const everything = useMemo<CanFn>(() => () => true, []);

  if (!layouts) {
    return error
      ? <p className="text-sm text-destructive">{error}</p>
      : <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const roleReady = scope === "role" && roleId !== null && (role !== null || roleEntry !== null);
  const permReady = scope === "permission" && permission !== "";
  const [permResource, permAction] = permission.split(":");

  return (
    <div className="space-y-6">
      <DashCard title="Layouts">
        <p className="text-xs text-muted-foreground mb-4">
          A layout sets the default navigation, page tabs and overview widgets for everyone with a role or permission.
          People can still rearrange their own. Order of precedence: the person, then their role (lowest rank first),
          then their permissions (lowest priority number first), then the built-in default.
        </p>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        {rolesNote && <p className="text-xs text-muted-foreground mb-3">{rolesNote}</p>}
        {!canWrite && <p className="text-xs text-muted-foreground mb-3">You can view layouts but not change them (needs Layout:write).</p>}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1.5">
            {(["role", "permission"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {s === "role" ? "By role" : "By permission"}
              </button>
            ))}
          </div>

          {scope === "role" ? (
            <label className="text-xs text-muted-foreground">
              Role
              <select
                value={roleId ?? ""}
                onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : null)}
                className="block mt-1 text-sm bg-background border border-border rounded-lg px-2 py-1.5 text-foreground min-w-48"
              >
                <option value="">Choose a role...</option>
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{layouts.roles.some((l) => l.roleId === r.id) ? " (has layout)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="text-xs text-muted-foreground">
                Permission
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  className="block mt-1 text-sm bg-background border border-border rounded-lg px-2 py-1.5 text-foreground min-w-56"
                >
                  <option value="">Choose a permission...</option>
                  {permissionOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}{layouts.permissions.some((l) => permLabel(l.resource, l.action) === k) ? " (has layout)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Priority (lower wins)
                <input
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(e) => setPriority(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="block mt-1 w-28 text-sm bg-background border border-border rounded-lg px-2 py-1.5 text-foreground"
                />
              </label>
            </>
          )}
        </div>
      </DashCard>

      {roleReady && (
        <DashCard title={`${(role?.name ?? roleEntry?.roleName) ?? "Role"} role layout`}>
          {!role && <p className="text-xs text-muted-foreground mb-3">This role's permissions can't be listed, so every item is shown.</p>}
          <LayoutEditor
            key={`role:${roleId}`}
            can={role ? roleCan : everything}
            hasEmployee
            below={[]}
            current={roleEntry?.config ?? null}
            currentLabel="This role"
            onSave={async (config) => { await saveRoleLayout(roleId!, config); await refresh(); }}
            onClear={async () => { await clearRoleLayout(roleId!); await refresh(); }}
            clearLabel="Clear role layout"
            clearHint="Removes this role's layout so its members fall back to the permission layouts and defaults"
            presets={canWrite ? PRESETS : []}
            saveLabel="Save role layout"
          />
        </DashCard>
      )}

      {permReady && (
        <DashCard title={`${permission} layout`}>
          <LayoutEditor
            key={`perm:${permission}`}
            can={everything}
            hasEmployee
            below={[]}
            current={permEntry?.config ?? null}
            currentLabel="This permission"
            onSave={async (config) => { await savePermissionLayout(permResource, permAction, priority, config); await refresh(); }}
            onClear={async () => { await clearPermissionLayout(permResource, permAction); await refresh(); }}
            clearLabel="Clear permission layout"
            clearHint="Removes this permission's layout"
            saveLabel="Save permission layout"
          />
        </DashCard>
      )}

      <DashCard title="Saved layouts">
        {layouts.roles.length === 0 && layouts.permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No role or permission layouts yet.</p>
        ) : (
          <ul className="text-sm space-y-1.5">
            {layouts.roles.map((r) => (
              <li key={`r${r.roleId}`} className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Role</span>
                <button type="button" className="text-primary hover:underline" onClick={() => { setScope("role"); setRoleId(r.roleId); }}>
                  {r.roleName}
                </button>
                <span className="text-xs text-muted-foreground">rank {r.rank}, updated {new Date(r.updatedAt).toLocaleDateString()}</span>
              </li>
            ))}
            {layouts.permissions.map((p) => (
              <li key={`p${permLabel(p.resource, p.action)}`} className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Permission</span>
                <button type="button" className="text-primary hover:underline" onClick={() => { setScope("permission"); setPermission(permLabel(p.resource, p.action)); }}>
                  {permLabel(p.resource, p.action)}
                </button>
                <span className="text-xs text-muted-foreground">priority {p.priority}, updated {new Date(p.updatedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  );
}
