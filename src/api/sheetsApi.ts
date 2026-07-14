// Google Sheets source calls against the Express server (server/routes/sheets.ts).
import { get, post, patch, del } from "./http";
import type { ImportBatch } from "./importApi";

export interface SheetSource {
  id: number;
  label: string;
  spreadsheetId: string;
  sheetUrl: string;
  accessMethod: "link" | "service_account";
  enabled: boolean;
  createdAt: string;
  lastSyncAt: string | null;
  lastSyncStatus: "preview_created" | "no_changes" | "error" | null;
  lastSyncError: string | null;
}

export interface SheetsConfig { serviceAccountEmail: string | null }
export interface SyncResponse { source: SheetSource; batch: ImportBatch | null }

export interface DriveSpreadsheet {
  id: string;
  name: string;
  mimeType: string; // "application/vnd.google-apps.spreadsheet" or xlsx
  modifiedTime: string;
  webViewLink: string;
  connected: boolean;
}

export const getSheetsConfig = () => get<SheetsConfig>("/sheets/config");
export const listAvailable = () => get<DriveSpreadsheet[]>("/sheets/available");
export const listSources = () => get<SheetSource[]>("/sheets/sources");
export const addSource = (url: string, label?: string) =>
  post<SyncResponse>("/sheets/sources", { url, label });
export const updateSource = (id: number, body: { label?: string; enabled?: boolean }) =>
  patch<SheetSource>(`/sheets/sources/${id}`, body);
export const deleteSource = (id: number) => del(`/sheets/sources/${id}`);
export const syncSheetSource = (id: number) => post<SyncResponse>(`/sheets/sources/${id}/sync`);
