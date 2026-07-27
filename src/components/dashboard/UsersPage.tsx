import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import UsersTab from "./UsersTab";
import InvitedUsersTab from "./InvitedUsersTab";
import { useAuth } from "@/lib/AuthContext";
import { listRoles, type RoleWithPermissions } from "@/api/rolesApi";
import type { Invite } from "@/api/invitesApi";
import { Plus, Users, UserPlus } from "lucide-react";

type TabId = "users" | "invites";

export default function UsersPage() {
  const { user, can } = useAuth();
  const canSeeUsers = can("User", "read");
  const canSeeInvites = can("Invite", "read");
  const canInviteWrite = can("Invite", "write");
  const heldPerms = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const [activeTab, setActiveTab] = useState<TabId>(canSeeUsers ? "users" : "invites");
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [formInvite, setFormInvite] = useState<Invite | null | undefined>(undefined); // undefined = closed

  useEffect(() => {
    if (can("User", "write") || canInviteWrite) listRoles().then(setRoles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    canSeeUsers && { id: "users" as const, label: "Users", icon: Users },
    canSeeInvites && { id: "invites" as const, label: "Invited Users", icon: UserPlus },
  ].filter(Boolean) as { id: TabId; label: string; icon: typeof Users }[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {tabs.length > 1 ? (
          <div className="flex items-center gap-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
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
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {activeTab === "users" ? "Users" : "Invited Users"}
          </p>
        )}

        {activeTab === "invites" && canInviteWrite && (
          <button
            onClick={() => setFormInvite(null)}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> Invite someone
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
          {activeTab === "users" && canSeeUsers && <UsersTab roles={roles} heldPerms={heldPerms} />}
          {activeTab === "invites" && canSeeInvites && (
            <InvitedUsersTab roles={roles} heldPerms={heldPerms} formInvite={formInvite} setFormInvite={setFormInvite} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
