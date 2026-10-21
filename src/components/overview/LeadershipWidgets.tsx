import React from "react";
import { Link } from "react-router-dom";
import KpiCard from "@/components/dashboard/KpiCard";
import DashCard from "@/components/dashboard/DashCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ReconciledBadge from "@/components/dashboard/ReconciledBadge";
import ExceptionAssignmentPanel from "@/components/dashboard/ExceptionAssignmentPanel";
import { UNAVAILABLE_METRICS } from "@/data/leadershipOverview";
import Cell, { type WidgetProps } from "./Cell";
import { useLeadershipData, type LeadershipKpiKey, type LeadershipReady } from "./LeadershipData";

function useReadyLeadership(): LeadershipReady | null {
  const l = useLeadershipData();
  return l?.status === "ready" ? l : null;
}

export function LeadershipHeader({ width }: WidgetProps) {
  const l = useLeadershipData();
  if (!l || l.status === "loading") return null;

  // The other leadership widgets render nothing until there is a company P&L,
  // so the explanation lives here, in the one widget that always shows.
  if (l.status === "empty") {
    return (
      <Cell width={width} kind="header">
        <DashCard title="Leadership Command Centre">
          <p className="text-sm text-muted-foreground">
            No company-wide Profit &amp; Loss data has been pushed yet. This view populates
            automatically once the Tally agent syncs the "Profit &amp; Loss" business unit.
          </p>
        </DashCard>
      </Cell>
    );
  }

  return (
    <Cell width={width} kind="header">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Leadership Command Centre
        </p>
        <ReconciledBadge period={l.bsAsOf} />
      </div>
    </Cell>
  );
}

function leadershipKpi(key: LeadershipKpiKey) {
  return function LeadershipKpi({ width }: WidgetProps) {
    const l = useReadyLeadership();
    if (!l) return null;
    return <Cell width={width} kind="kpi"><KpiCard {...l.kpis[key]} /></Cell>;
  };
}

export const LeadershipKpiRevenue = leadershipKpi("revenue");
export const LeadershipKpiMargin = leadershipKpi("margin");
export const LeadershipKpiAssets = leadershipKpi("assets");
export const LeadershipKpiBalanceCheck = leadershipKpi("balanceCheck");
export const LeadershipKpiCashNet = leadershipKpi("cashNet");
export const LeadershipKpiStoreFnbTarget = leadershipKpi("storeFnbTarget");

export function LeadershipInterventions({ width }: WidgetProps) {
  const l = useReadyLeadership();
  if (!l) return null;
  const { healthChecks, hasAssignment } = l;
  return (
    <Cell width={width} kind="card">
      <DashCard title="Where to Intervene">
        {healthChecks.map((item, i) => {
          const showExtra = !!item.exceptionKey
            && (item.row.status !== "green" || hasAssignment(item.exceptionKey));
          return (
            <div
              key={item.row.label}
              className={i < healthChecks.length - 1 ? "border-b border-border" : ""}
            >
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-muted-foreground">{item.row.label}</span>
                <StatusBadge status={item.row.status}>{item.row.value}</StatusBadge>
              </div>
              {showExtra && (
                <div className="pb-3 -mt-1 space-y-1.5">
                  {item.reason && <p className="text-xs text-muted-foreground">{item.reason}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    {item.href && (
                      <Link to={item.href} className="text-xs text-primary hover:underline shrink-0">
                        View details
                      </Link>
                    )}
                    <ExceptionAssignmentPanel exceptionKey={item.exceptionKey!} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </DashCard>
    </Cell>
  );
}

export function LeadershipUnavailable({ width }: WidgetProps) {
  const l = useReadyLeadership();
  if (!l) return null;
  return (
    <Cell width={width} kind="card">
      <DashCard title="Not Yet Available">
        <ul className="space-y-2">
          {UNAVAILABLE_METRICS.map((m) => (
            <li key={m} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              {m}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          None of these are derivable from any source data connected today - shown here rather
          than silently left out, so the gap stays visible.
        </p>
      </DashCard>
    </Cell>
  );
}

export function LeadershipFootnote({ width }: WidgetProps) {
  const l = useReadyLeadership();
  if (!l) return null;
  return (
    <Cell width={width} kind="text">
      <p className="text-xs text-muted-foreground">
        Company Revenue and Net Margin above come from the Tally agent&rsquo;s consolidated
        Profit &amp; Loss push. The Store + F&B vs Target figure is a separate, narrower number
        from the Store and F&B sales trackers - the two are not the same revenue and must not be
        added together.
      </p>
    </Cell>
  );
}
