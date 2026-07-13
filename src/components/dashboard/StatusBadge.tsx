import React from "react";

const badgeStyles = {
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800",
};

interface StatusBadgeProps {
  status: "green" | "amber" | "red";
  children?: React.ReactNode;
}

export default function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${badgeStyles[status] || badgeStyles.green}`}>
      {children}
    </span>
  );
}