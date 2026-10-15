import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

export interface PLRowDetail {
  label: string;
  value: string;
}

export interface PLRowData {
  label: string;
  value: React.ReactNode;
  isTotal?: boolean;
  status?: "green" | "amber" | "red" | null;
  details?: PLRowDetail[];
}

export default function PLRow({ label, value, isTotal = false, status = null, details }: PLRowData) {
  const [open, setOpen] = useState(false);
  const valueColor = status === "green"
    ? "text-emerald-600 dark:text-emerald-400"
    : status === "red"
      ? "text-red-600 dark:text-red-400"
      : "text-foreground";

  const header = (
    <div className={`flex justify-between items-center py-2.5 ${isTotal ? "font-semibold" : ""}`}>
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        {label}
        {details && details.length > 0 && (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </span>
      <span className={`text-sm ${valueColor}`}>{value}</span>
    </div>
  );

  if (!details || details.length === 0) {
    return <div className="border-b border-border last:border-b-0">{header}</div>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border last:border-b-0">
      <CollapsibleTrigger className="w-full text-left">{header}</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-2.5 pl-4 space-y-1.5">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{d.label}</span>
              <span>{d.value}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
