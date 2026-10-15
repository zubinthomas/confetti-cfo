import React from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  /** What this metric means - shown in the info popover next to the label. */
  definition?: string;
  /** Where this figure comes from (e.g. an import kind's label) - page-level, not per-figure. */
  source?: string;
  /** ISO timestamp the source data was last committed. */
  updatedAt?: string;
}

export default function KpiCard({ label, value, sub = null, status = null, href, definition, source, updatedAt }: KpiData) {
  const hasContext = !!(definition || source || updatedAt);

  // The info popover's trigger can't live inside the <Link> below: Radix's
  // trigger only opens when the click event reaches it with
  // defaultPrevented still false, but stopping the Link's own navigation
  // requires calling preventDefault on the same click - the two can't both
  // hold for a trigger nested inside the anchor. So the label row (with the
  // popover) sits outside the Link, and only the value/sub block is the
  // actual link target.
  const labelRow = (
    <div className="flex items-center gap-1 mb-1.5">
      <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
        {label}
      </p>
      {hasContext && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`About ${label}`}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <Info className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 text-sm">
            {definition && <p className="text-popover-foreground">{definition}</p>}
            {(source || updatedAt) && (
              <p className="text-xs text-muted-foreground mt-2">
                {source && `Source: ${source}`}
                {source && updatedAt && " · "}
                {updatedAt && `Updated ${new Date(updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );

  const valueBlock = (
    <>
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

  return (
    <div className={cn("min-w-0 bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow", href && "hover:border-primary/40")}>
      {labelRow}
      {href ? <Link to={href} className="block">{valueBlock}</Link> : valueBlock}
    </div>
  );
}
