import React from "react";
import type { ImportFreshness } from "@/hooks/useImportFreshness";

// Distinct from ReconciledBadge - tracker-sourced pages (department
// workbooks, not Tally) have no books-of-record check to reconcile against,
// so "provisional"/"reconciled" would be the wrong claim here. This states
// only what's actually true: the page's data was last committed through the
// reviewed import pipeline on this date. Neutral color, never green/amber/
// red, so it never reads as a status judgment.
export default function TrackerImportBadge({ freshness }: { freshness?: ImportFreshness }) {
  if (!freshness) return null;
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      title={`Source: ${freshness.source}`}
    >
      Imported {new Date(freshness.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
    </span>
  );
}
