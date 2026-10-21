import React from "react";
import { Navigate } from "react-router-dom";
import AccessRestricted from "@/components/AccessRestricted";
import OverviewGrid from "@/components/overview/OverviewGrid";
import { useAuth } from "@/lib/AuthContext";
import { GATES } from "@/lib/layout/registry";
import { firstAccessibleRoute, gateAllows } from "@/lib/layout/resolve";
import { useNav } from "@/lib/layout/useNav";

/** The `/` route. Shows the Overview to anyone who can open it; everyone else
 *  is sent to the first page in their own nav instead of a dead end. */
export default function Landing() {
  const { can } = useAuth();
  const nav = useNav();

  if (gateAllows(GATES.financial, can)) return <OverviewGrid />;

  const home = firstAccessibleRoute(nav);
  if (home && home !== "/") return <Navigate to={home} replace />;

  return (
    <AccessRestricted message="You don't have permission to view this page. Contact your administrator if you believe this is a mistake." />
  );
}
