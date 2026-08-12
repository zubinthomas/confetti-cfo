// Workbook-import calls against the Express server (server/routes/import.ts).
import { get, post, authHeaders, API_BASE } from "./http";

export interface ImportIssue {
  level: "error" | "warning" | "info";
  sheet: string;
  message: string;
}

export interface ImportTableStats { creates: number; updates: number; unchanged: number }

export interface ImportFieldChange { field: string; from: unknown; to: unknown }
export interface ImportRecordChange { action: "create" | "update"; description: string; fields?: ImportFieldChange[] }
export type ImportBatchDetails = Record<string, ImportRecordChange[]> | null;

export interface ImportBatch {
  id: number;
  filename: string;
  kind: "cepl" | "cafe" | "sienna" | "hr" | "target" | "fnbMonthly";
  status: "preview" | "committed" | "discarded";
  uploadedAt: string;
  committedAt: string | null;
  issues: ImportIssue[];
  stats: Record<string, ImportTableStats>;
  sourceType: "upload" | "sheet";
  sheetSourceId: number | null;
}

/** A workbook that failed validation: no batch was created on the server. */
export interface RejectedUpload {
  message: string;
  filename: string;
  kind: ImportBatch["kind"];
  issues: ImportIssue[];
}

export type UploadResult =
  | { batch: ImportBatch; rejected?: undefined }
  | { batch?: undefined; rejected: RejectedUpload };

export async function uploadWorkbook(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/import/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 422) return { rejected: json };
  if (!res.ok) throw new Error(json.message || "Upload failed");
  return { batch: json };
}

export const listBatches = () => get<ImportBatch[]>("/import/batches");
export const commitBatch = (id: number) => post<ImportBatch>(`/import/${id}/commit`);
export const discardBatch = (id: number) => post<ImportBatch>(`/import/${id}/discard`);
export const getBatchDetails = (id: number) => get<{ details: ImportBatchDetails }>(`/import/${id}/details`);
