import React from "react";
import PageSpinner from "@/components/dashboard/PageSpinner";
import { useOverviewWidgets } from "@/lib/layout/useWidgets";
import { GroupProvider, useGroupData } from "./GroupData";
import { LeadershipProvider, useLeadershipData } from "./LeadershipData";
import { OVERVIEW_COMPONENTS } from "./widgets";

/** The Overview page: the widgets this user's layout shows, on a 12-column
 *  grid. Data providers mount only for the kinds of widget that are visible,
 *  so a Leadership-only layout never fetches the Group data and vice versa. */
export default function OverviewGrid() {
  const visible = useOverviewWidgets();
  const needsGroup = visible.some((r) => r.widget.source === "group");
  const needsLeadership = visible.some((r) => r.widget.source === "leadership");

  let body = (
    <Grid>
      {visible.map(({ widget, width }) => {
        const Widget = OVERVIEW_COMPONENTS[widget.id];
        return Widget ? <Widget key={widget.id} width={width} /> : null;
      })}
    </Grid>
  );
  if (needsLeadership) body = <LeadershipProvider>{body}</LeadershipProvider>;
  if (needsGroup) body = <GroupProvider>{body}</GroupProvider>;

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every overview widget is hidden in your layout. Show some again from your layout settings.
      </p>
    );
  }
  return body;
}

function Grid({ children }: { children: React.ReactNode }) {
  const group = useGroupData();
  const leadership = useLeadershipData();
  if (group?.status === "loading" || leadership?.status === "loading") return <PageSpinner />;
  return <div className="grid grid-cols-12 gap-3">{children}</div>;
}
