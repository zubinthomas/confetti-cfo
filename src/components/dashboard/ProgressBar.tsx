import React from "react";

interface ProgressBarProps {
  label: string;
  value: React.ReactNode;
  percent: number;
  color?: string;
}

export default function ProgressBar({ label, value, percent, color = "#3b82f6" }: ProgressBarProps) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}