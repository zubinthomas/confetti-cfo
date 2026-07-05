import React from "react";

export default function PLRow({ label, value, isTotal, status }) {
  const valueColor = status === "green"
    ? "text-emerald-600 dark:text-emerald-400"
    : status === "red"
      ? "text-red-600 dark:text-red-400"
      : "text-foreground";

  return (
    <div className={`flex justify-between items-center py-2.5 border-b border-border last:border-b-0 ${isTotal ? "font-semibold" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${valueColor}`}>{value}</span>
    </div>
  );
}