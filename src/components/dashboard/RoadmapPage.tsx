import React, { useEffect, useState } from "react";
import { listRoadmap, type RoadmapItem, type RoadmapStatus } from "@/api/roadmapApi";
import StatusBadge from "./StatusBadge";
import { Loader2 } from "lucide-react";

const COLUMNS: { status: RoadmapStatus; label: string; badge: "green" | "amber" | "red" }[] = [
  { status: "completed", label: "Completed", badge: "green" },
  { status: "in_progress", label: "In Progress", badge: "amber" },
  { status: "blocked", label: "Blocked", badge: "red" },
];

function RoadmapCard({ item }: { item: RoadmapItem }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-semibold text-card-foreground">{item.title}</h4>
      </div>
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{item.area}</span>
      <p className="text-sm text-muted-foreground mt-1.5">{item.description}</p>
      {item.reason && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 pt-2 border-t border-border">
          {item.reason}
        </p>
      )}
    </div>
  );
}

export default function RoadmapPage() {
  const [items, setItems] = useState<RoadmapItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listRoadmap()
      .then((data) => setItems(data.items))
      .catch((err: Error) => setError(err.message || "Failed to load roadmap"));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!items) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading roadmap…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map((col) => {
        const colItems = items.filter((i) => i.status === col.status);
        return (
          <div key={col.status}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold font-heading text-foreground">{col.label}</h3>
              <StatusBadge status={col.badge}>{colItems.length}</StatusBadge>
            </div>
            <div className="space-y-3">
              {colItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing here.</p>
              ) : (
                colItems.map((item) => <RoadmapCard key={item.id} item={item} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
