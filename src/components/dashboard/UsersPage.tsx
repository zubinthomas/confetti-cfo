import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import UsersTab from "./UsersTab";
import InvitedUsersTab from "./InvitedUsersTab";
import RolesTab from "./RolesTab";
import LayoutsTab from "./LayoutsTab";
import { useAuth } from "@/lib/AuthContext";
import { useTabs } from "@/lib/layout/useTabs";
import { listRoles, type RoleWithPermissions } from "@/api/rolesApi";
import type { Invite } from "@/api/invitesApi";
import { Plus } from "lucide-react";

export default function UsersPage() {
  const { user, can } = useAuth();
  const canSeeUsers = can("User", "read");
  const canSeeInvites = can("Invite", "read");
  const canInviteWrite = can("Invite", "write");
  const canSeeRoles = can("Role", "read");
  const canSeeLayouts = can("Layout", "read");
  const canRoleWrite = can("Role", "write");
  const heldPerms = useMemo(() => new Set(user?.permissions ?? []), [user]);

  // Which tabs exist (each needs its own read permission), their order and
  // the one that opens first come from the layout registry.
  const { tabs, active: activeTab, setActive: setActiveTab } = useTabs("users");
  const [roles, setRoles] = useState<RoleWithPermissions[] | null>(null);
  const [rolesError, setRolesError] = useState("");
  const [formInvite, setFormInvite] = useState<Invite | null | undefined>(undefined); // undefined = closed
  const [formRole, setFormRole] = useState<RoleWithPermissions | null | undefined>(undefined); // undefined = closed

  const refreshRoles = () => { listRoles().then(setRoles).catch((err: Error) => setRolesError(err.message)); };
  useEffect(() => {
    if (can("User", "write") || canInviteWrite || canSeeRoles) refreshRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const soloLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {tabs.length > 1 ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            {tabs.map((tab) => {
              const Icon = tab.icon!;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 max-sm:min-h-11 rounded-lg text-sm font-medium transition-all duration-200 ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{soloLabel}</p>
        )}

        {activeTab === "invites" && canInviteWrite && (
          <button
            onClick={() => setFormInvite(null)}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> Invite someone
          </button>
        )}
        {activeTab === "roles" && canRoleWrite && (
          <button
            onClick={() => setFormRole(null)}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> New role
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "users" && canSeeUsers && <UsersTab roles={roles ?? []} heldPerms={heldPerms} />}
          {activeTab === "invites" && canSeeInvites && (
            <InvitedUsersTab roles={roles ?? []} heldPerms={heldPerms} formInvite={formInvite} setFormInvite={setFormInvite} />
          )}
          {activeTab === "layouts" && canSeeLayouts && <LayoutsTab heldPerms={heldPerms} />}
          {activeTab === "roles" && canSeeRoles && (
            <RolesTab roles={roles} heldPerms={heldPerms} formRole={formRole} setFormRole={setFormRole} error={rolesError} refresh={refreshRoles} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
