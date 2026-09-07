// Admin document upload/management for one employee - the upload plumbing
// (uploadFile -> POST /api/integrations/upload) and the 7 named doc-URL
// columns + internalDocuments jsonb array already exist on the Employee
// entity (server/db/schema.ts); this is the first UI that surfaces them
// beyond photoUrl. Each action persists immediately via Employee.update,
// same "act now, not staged in a form" pattern as HeadcountTab's
// PayrollSection, rather than being staged in the add/edit form.
import React, { useState } from "react";
import { Employee } from "@/api/entities";
import { uploadFile } from "@/api/integrations";
import { FileText, Plus, Loader2, X } from "lucide-react";

const NAMED_SLOTS: { field: string; label: string }[] = [
  { field: "id_proof_url", label: "ID Proof" },
  { field: "aadhar_url", label: "Aadhar" },
  { field: "pan_url", label: "PAN" },
  { field: "offer_letter_url", label: "Offer Letter" },
  { field: "contract_url", label: "Contract" },
  { field: "police_verification_url", label: "Police Verification" },
  { field: "health_record_url", label: "Health Record" },
];

interface InternalDoc { label: string; url: string; uploadedAt: string }

export default function EmployeeDocumentsPanel({ employee, canWrite, onChange }: {
  employee: any; canWrite: boolean; onChange: () => void;
}) {
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState("");

  const internalDocs: InternalDoc[] = employee.internal_documents ?? [];

  const uploadToField = async (field: string, file: File) => {
    setError("");
    setUploadingField(field);
    try {
      const { file_url } = await uploadFile(file);
      await Employee.update(employee.id, { [field]: file_url });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingField(null);
    }
  };

  const addInternalDoc = async (file: File) => {
    if (!newLabel.trim()) {
      setError("Give the document a label before uploading");
      return;
    }
    setError("");
    setUploadingField("__internal");
    try {
      const { file_url } = await uploadFile(file);
      const next = [...internalDocs, { label: newLabel.trim(), url: file_url, uploadedAt: new Date().toISOString() }];
      await Employee.update(employee.id, { internal_documents: next });
      setNewLabel("");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingField(null);
    }
  };

  const removeInternalDoc = async (index: number) => {
    setError("");
    try {
      await Employee.update(employee.id, { internal_documents: internalDocs.filter((_, i) => i !== index) });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove document");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Documents</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {NAMED_SLOTS.map(({ field, label }) => {
            const url = employee[field];
            return (
              <div key={field} className="flex items-center justify-between gap-2 text-sm border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View</a>}
                  {canWrite && (
                    <label className="cursor-pointer text-xs text-muted-foreground hover:text-primary">
                      <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadToField(field, e.target.files[0])} />
                      {uploadingField === field ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (url ? "Replace" : "Upload")}
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Internal Documents</p>
        {internalDocs.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {internalDocs.map((doc, i) => (
              <div key={i} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{doc.label}</a>
                {canWrite && (
                  <button onClick={() => removeInternalDoc(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canWrite && (
          <div className="flex items-center gap-2">
            <input
              type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Document label"
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            />
            <label className="cursor-pointer flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-border text-foreground hover:bg-muted whitespace-nowrap">
              {uploadingField === "__internal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && addInternalDoc(e.target.files[0])} />
              Add
            </label>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
