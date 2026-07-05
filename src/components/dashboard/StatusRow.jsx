import React from "react";
import StatusBadge from "./StatusBadge";

export default function StatusRow({ label, status, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <StatusBadge status={status}>{value}</StatusBadge>
    </div>
  );
}