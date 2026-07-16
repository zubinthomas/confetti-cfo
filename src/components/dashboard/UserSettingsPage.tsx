import React from "react";
import DashCard from "./DashCard";
import { useAuth } from "@/lib/AuthContext";
import { UserCog } from "lucide-react";

export default function UserSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <DashCard title="Account">
        <div className="flex items-center gap-3 text-sm">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <UserCog className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-foreground font-medium">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </DashCard>
      <DashCard title="User settings">
        <p className="text-sm text-muted-foreground">
          Personal preferences (notifications, display name, password) aren't wired up yet - coming soon.
        </p>
      </DashCard>
    </div>
  );
}
