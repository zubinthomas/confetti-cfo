// Settings calls against the Express server (server/routes/settings.ts).
// Read-only for now - the backend rejects writes with 403.
import { get } from "./http";

export type SettingCategory =
  | "server" | "security" | "llm" | "google_oauth" | "google_sheets" | "email";

export interface Setting {
  id: number;
  key: string;
  value: string | null;
  category: SettingCategory;
  label: string;
  description: string | null;
  isSecret: boolean;
  updatedAt: string;
}

export const listSettings = () => get<Setting[]>("/settings");
