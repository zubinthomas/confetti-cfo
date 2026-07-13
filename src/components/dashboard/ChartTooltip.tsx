import React from "react";
import { L } from "@/data/core";

interface TooltipEntry { name?: string | number; value?: number; color?: string }
interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

export default function ChartTooltip({ active = false, payload = [], label = "" }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span style={{ color: p.color }}>●</span> {p.name}:{" "}
          {typeof p.value === "number" && String(p.name).includes("%")
            ? `${p.value.toFixed(1)}%`
            : `₹${L(p.value)}`}
        </p>
      ))}
    </div>
  );
}
