import React from "react";
import DashCard from "./DashCard";
import { useAuth } from "@/lib/AuthContext";
import { UserCog } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import MyLayoutEditor from "@/components/layout-editor/MyLayoutEditor";
import type { EditorSection } from "@/components/layout-editor/LayoutEditor";

const SECTIONS: EditorSection[] = ["nav", "tabs", "widgets"];

export default function UserSettingsPage() {
  const { user } = useAuth();
  // ?section=widgets opens the editor on the overview widgets (the overview's "Edit layout" link).
  const [params] = useSearchParams();
  const requested = params.get("section") as EditorSection | null;
  const initialSection = requested && SECTIONS.includes(requested) ? requested : undefined;

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
      <DashCard title="Your layout">
        <p className="text-xs text-muted-foreground mb-4">
          Arrange the navigation, page tabs and overview widgets for yourself. Anything you leave alone keeps following
          your roles and permissions.
        </p>
        <MyLayoutEditor initialSection={initialSection} />
      </DashCard>
      <DashCard title="User settings">
        <p className="text-sm text-muted-foreground">
          Personal preferences (notifications, display name, password) aren't wired up yet - coming soon.
        </p>
      </DashCard>
    </div>
  );
}
