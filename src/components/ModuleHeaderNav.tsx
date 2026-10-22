import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import UserMenu from "@/components/dashboard/UserMenu";
import { useCompactNav } from "@/lib/layout/useNav";

/** The "back to the dashboard" link and divider at the left of a module page's
 *  header. Left out when the person has nowhere else to go, since the link
 *  would only lead back to this same page. */
export function BackToDashboard() {
  if (useCompactNav()) return null;
  return (
    <>
      <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> CFO Dashboard
      </Link>
      <span className="text-muted-foreground/40">|</span>
    </>
  );
}

/** Module pages have no user menu of their own. Someone with nowhere else to
 *  go gets it here instead of the back link, so they can still reach their
 *  settings and sign out. */
export function CompactUserMenu() {
  return useCompactNav() ? <UserMenu /> : null;
}
