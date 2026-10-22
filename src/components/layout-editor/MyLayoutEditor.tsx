import React, { useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { resetOwnLayout, saveOwnLayout } from "@/api/layoutsApi";
import type { LabelledLayer } from "@/lib/layout/editor";
import LayoutEditor, { type EditorSection } from "./LayoutEditor";

/** The signed-in user's own layout, over the layers they inherit from their
 *  permissions and roles. */
export default function MyLayoutEditor({ initialSection }: { initialSection?: EditorSection }) {
  const { user, can, setOwnLayout } = useAuth();
  const layout = user?.layout;

  const below = useMemo<LabelledLayer[]>(() => {
    if (!layout) return [];
    const roleName = new Map((user?.roles ?? []).map((r) => [r.id, r.name]));
    return [
      ...layout.permission.map((l) => ({ label: l.key, config: l.config })),
      ...layout.roles.map((l) => ({ label: `${roleName.get(l.roleId) ?? "Role"} role`, config: l.config })),
    ];
  }, [layout, user?.roles]);

  if (!user) return null;

  return (
    <LayoutEditor
      can={can}
      hasEmployee={!!user.employee}
      below={below}
      current={layout?.user ?? null}
      currentLabel="You"
      onSave={async (config) => { await saveOwnLayout(config); setOwnLayout(config); }}
      onClear={async () => { await resetOwnLayout(); setOwnLayout(null); }}
      clearLabel="Reset to defaults"
      clearHint="Removes your changes and goes back to what your roles and permissions give you"
      initialSection={initialSection}
    />
  );
}
