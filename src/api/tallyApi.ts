// Tally source + ledger-mapping calls against the Express server
// (server/routes/tally.ts). Syncing itself is agent-to-server
// (server/routes/tallyAgent.ts) - nothing here triggers a sync, this is the
// admin surface for API keys, cadence, and the ledger mapping table.
import { get, post, patch, del, authHeaders, API_BASE } from "./http";
import type { ImportIssue } from "./importApi";

export type TallySyncMode = "auto" | "manual" | "paused";
export type TallySyncStatus = "preview_created" | "auto_committed" | "no_changes" | "error";

export interface TallySource {
  id: number;
  label: string;
  syncMode: TallySyncMode;
  syncIntervalMinutes: number;
  /** Overrides the agent's local config.toml when set; null falls back to it. */
  tallyGatewayUrl: string | null;
  tallyCompanyName: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: TallySyncStatus | null;
  lastSyncError: string | null;
  lastSyncIssues: ImportIssue[] | null;
}

export interface TallyLedgerMapping {
  id: number;
  tallySourceId: number;
  ledgerName: string;
  groupName: string | null;
  businessUnitId: number | null;
  lineItemId: number | null;
  createdAt: string;
}

/** Only returned once, right when a key is created or rotated - the server
 *  never stores or returns the raw key again after this. */
export interface SourceWithApiKey { source: TallySource; apiKey: string }

export const listTallySources = () => get<TallySource[]>("/tally/sources");
export const createTallySource = (label: string) =>
  post<SourceWithApiKey>("/tally/sources", { label });
export const updateTallySource = (
  id: number,
  body: {
    label?: string; syncMode?: TallySyncMode; syncIntervalMinutes?: number;
    tallyGatewayUrl?: string | null; tallyCompanyName?: string | null;
  },
) => patch<TallySource>(`/tally/sources/${id}`, body);
export const rotateTallySourceKey = (id: number) =>
  post<SourceWithApiKey>(`/tally/sources/${id}/rotate-key`);
export const deleteTallySource = (id: number) => del(`/tally/sources/${id}`);

export const listTallyMappings = (sourceId: number) =>
  get<TallyLedgerMapping[]>(`/tally/sources/${sourceId}/mappings`);
export const updateTallyMapping = (
  id: number,
  body: { businessUnitId?: number | null; lineItemId?: number | null },
) => patch<TallyLedgerMapping>(`/tally/mappings/${id}`, body);

export interface ImportMappingsResult { imported: number }

/** Uploads a Tally "List of Ledgers" export to seed/refresh this source's
 *  mapping rows - existing businessUnitId/lineItemId assignments survive a
 *  re-import (see server/routes/tally.ts). */
export async function importTallyMappings(sourceId: number, file: File): Promise<ImportMappingsResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/tally/sources/${sourceId}/mappings/import`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Import failed");
  return json;
}
