// Document templates (ID cards, salary slips) - server/routes/documentTemplates.ts.
import { get, post, put, del, authHeaders, API_BASE } from "./http";
import type { DocType, DocumentTemplate, FieldDef, TemplateElement } from "@/lib/documentTemplates";

export interface TemplateOption { id: string; name: string; isDefault: boolean }

export interface TemplateRow extends DocumentTemplate {
  isDefault: boolean;
  createdDate: string;
  updatedAt: string;
  updatedByUserId: number | null;
}

/** For the Designer screen - requires DocumentTemplate:read. */
export const listTemplates = (docType?: DocType) =>
  get<{ templates: TemplateRow[] }>(`/document-templates${docType ? `?docType=${docType}` : ""}`).then((r) => r.templates);

/** For a template picker - any authenticated user, no permission needed. */
export const listTemplateOptions = (docType: DocType) =>
  get<{ templates: TemplateOption[] }>(`/document-templates/options?docType=${docType}`).then((r) => r.templates);

export const getFieldCatalog = (docType: DocType) =>
  get<{ fields: FieldDef[]; page: { w: number; h: number; orientation: string } }>(`/document-templates/field-catalog?docType=${docType}`);

/** The actual template to generate a document from - `id` omitted resolves
 *  to that docType's default. Used by src/lib/employeeDocs.ts. */
export const fetchTemplateForRender = (docType: DocType, id?: string) =>
  get<DocumentTemplate>(`/document-templates/render?docType=${docType}${id ? `&id=${id}` : ""}`);

export const createTemplate = (name: string, docType: DocType, elements: TemplateElement[]) =>
  post<TemplateRow>("/document-templates", { name, docType, elements });

export const updateTemplate = (id: string, name: string, elements: TemplateElement[]) =>
  put<TemplateRow>(`/document-templates/${id}`, { name, elements });

export const setDefaultTemplate = (id: string) =>
  put<{ ok: true }>(`/document-templates/${id}/default`);

export const deleteTemplate = (id: string) =>
  del<{ ok: true }>(`/document-templates/${id}`);

/** Upload a background/logo image; returns { file_url }. */
export async function uploadTemplateImage(file: File): Promise<{ file_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/document-templates/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || "Upload failed");
  }
  return res.json();
}
