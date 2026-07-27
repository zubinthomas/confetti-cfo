import { useMemo } from "react";
import type { PermissionAction } from "@/api/invitesApi";

export const PERMISSION_ACTIONS: PermissionAction[] = ["read", "write", "delete"];
export const permKey = (resource: string, action: string) => `${resource}:${action}`;

/** Checkbox grid: resources x read/write/delete. `heldPerms` (the current
 *  user's own permissions) render as normal editable checkboxes - nothing
 *  else is even shown, since nothing else could be granted anyway.
 *  `lockedPerms` (already granted, from before, but not held by the current
 *  user) render checked-and-disabled, so an editor without a given
 *  permission can neither grant it nor silently strip it by saving.
 *
 *  Shared by the invite-creation form and the user-management edit modal -
 *  both need the identical "only what I hold is adjustable" pattern. */
export default function PermissionMatrix({
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
        You don't hold any permissions yourself, so there's nothing you can grant here.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground border-b border-border text-xs">
          <th className="py-1.5 pr-3 font-medium">Resource</th>
          {PERMISSION_ACTIONS.map((a) => (
            <th key={a} className="py-1.5 px-2 font-medium text-center capitalize">{a}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {resources.map((resource) => (
          <tr key={resource} className="border-b border-border last:border-0">
            <td className="py-1.5 pr-3 text-foreground">{resource}</td>
            {PERMISSION_ACTIONS.map((action) => {
              const k = permKey(resource, action);
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
