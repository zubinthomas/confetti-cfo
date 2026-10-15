import React from "react";
import { Link } from "react-router-dom";

const statusColors = {
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
};

export type KpiStatus = "green" | "amber" | "red";

export interface KpiData {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  status?: KpiStatus | null;
  /** When set, the whole card links to this route (e.g. a drill-down into detail). */
  href?: string;
}

export default function KpiCard({ label, value, sub = null, status = null, href }: KpiData) {
  const className = `block min-w-0 bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow${href ? " hover:border-primary/40" : ""}`;
  const body = (
    <>
      <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-semibold font-heading text-card-foreground leading-tight break-words">
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-1 ${(status && statusColors[status]) || "text-muted-foreground"}`}>
          {sub}
        </p>
      )}
    </>
  );

  if (href) return <Link to={href} className={className}>{body}</Link>;
  return <div className={className}>{body}</div>;
}