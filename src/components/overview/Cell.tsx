import React from "react";
import type { WidgetWidth } from "@/lib/layout/types";

export interface WidgetProps { width: WidgetWidth }

// Static strings so Tailwind's scanner sees every class. The overview is a
// 12-column grid: sixth = the old 6-up KPI row (2-up on phones, 3-up on
// tablets), third and half stack on small screens.
const COLUMNS: Record<WidgetWidth, string> = {
  sixth: "col-span-6 sm:col-span-4 lg:col-span-2",
  third: "col-span-12 sm:col-span-6 lg:col-span-4",
  half: "col-span-12 lg:col-span-6",
  full: "col-span-12",
};

type Kind = "header" | "kpi" | "card" | "text";

/** The grid cell a widget renders into. Each widget wraps itself (rather than
 *  the grid wrapping every widget) so a widget with nothing to show leaves no
 *  empty cell behind. Cards get a top margin on top of the grid gap, which
 *  keeps the 24px between sections the page had before it was a grid. KPI and
 *  card contents stretch so cells in one row stay the same height. */
export default function Cell({ width, kind, children }: WidgetProps & { kind: Kind; children: React.ReactNode }) {
  const spacing = kind === "card" || kind === "text" ? "mt-3" : "";
  const stretch = kind === "kpi" || kind === "card" ? "flex flex-col [&>*]:grow" : "";
  return <div className={`min-w-0 ${COLUMNS[width]} ${spacing} ${stretch}`.trim()}>{children}</div>;
}
