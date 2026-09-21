// Roadmap board calls against the Express server (server/routes/roadmap.ts).
// Read-only, backed by a hand-edited file (server/roadmap/items.json), not
// the database.
import { get } from "./http";

export type RoadmapStatus = "completed" | "in_progress" | "blocked";

export interface RoadmapItem {
  id: string;
  title: string;
  area: string;
  status: RoadmapStatus;
  description: string;
  reason?: string | null;
}

export const listRoadmap = () => get<{ items: RoadmapItem[] }>("/roadmap");
