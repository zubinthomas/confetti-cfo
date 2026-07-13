// Workbook-import calls against the Express server (server/routes/import.ts).
import { get, post, authHeaders, API_BASE } from "./http";

export interface ImportIssue {
  level: "error" | "warning" | "info";
  sheet: string;
  message: string;
}

export interface ImportTableStats { creates: number; updates: number; unchanged: number }

export interface ImportBatch {
  id: number;
  filename: string;
  kind: "cepl" | "cafe" | "sienna";
  status: "preview" | "committed" | "discarded";
  uploadedAt: string;
  committedAt: string | null;
  issues: ImportIssue[];
  stats: Record<string, ImportTableStats>;
}

export async function uploadWorkbook(file: File): Promise<ImportBatch> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/import/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Upload failed");
  return json;
}

export const listBatches = () => get<ImportBatch[]>("/import/batches");
export const commitBatch = (id: number) => post<ImportBatch>(`/import/${id}/commit`);
export const discardBatch = (id: number) => post<ImportBatch>(`/import/${id}/discard`);
