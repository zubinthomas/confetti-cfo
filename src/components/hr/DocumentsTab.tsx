import React, { useState, useEffect } from "react";
import { Employee } from "@/api/entities";
import { uploadFile } from "@/api/integrations";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Clock, XCircle, X } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { DIVISIONS } from "@/lib/hrDivisions";
import { useAuth } from "@/lib/AuthContext";

interface InternalDoc { label: string; url: string; uploadedAt: string }

const pvStatusIcon: Record<string, React.ComponentType<{ className?: string }>> = { Verified: CheckCircle2, Submitted: Clock, Pending: AlertCircle, Rejected: XCircle };
const pvStatusColor: Record<string, string> = { Verified: "text-emerald-500", Submitted: "text-blue-500", Pending: "text-amber-500", Rejected: "text-red-500" };
const pvBadge: Record<string, string> = { Verified: "green", Submitted: "green", Pending: "amber", Rejected: "red" };

// Module-scope (stable identity) so re-renders during an upload don't
// remount every file input - see FormField.tsx for why this matters.
function DocCell({ empId, field, url, uploading, onUpload }: {
  empId: string; field: string; url?: string; uploading: boolean;
  onUpload: (empId: string, field: string, file: File) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          <FileText className="w-3.5 h-3.5" /> View
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      )}
      <label className="cursor-pointer">
        <input type="file" className="hidden" onChange={e => e.target.files[0] && onUpload(empId, field, e.target.files[0])} />
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
        )}
      </label>
    </div>
  );
}

// Unlike the single-file slots above, internal documents are a list - each
// upload appends rather than replacing, and each entry can be removed on
// its own. The label is just the uploaded file's own name; there's no
// separate naming step, matching how the other doc slots are one-click too.
function InternalDocsCell({ empId, docs, uploading, onUpload, onRemove }: {
  empId: string; docs: InternalDoc[]; uploading: boolean;
  onUpload: (empId: string, file: File) => void;
  onRemove: (empId: string, index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      {docs.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
      {docs.map((doc, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <a href={doc.url} target="_blank" rel="noopener noreferrer" title={doc.label}
            className="flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-[110px]">
            <FileText className="w-3 h-3 shrink-0" /> <span className="truncate">{doc.label}</span>
          </a>
          <button onClick={() => onRemove(empId, i)} className="shrink-0 text-muted-foreground hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <label className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
        <input type="file" className="hidden" onChange={e => e.target.files[0] && onUpload(empId, e.target.files[0])} />
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Upload className="w-3 h-3" /> Add</>}
      </label>
    </div>
  );
}

export default function DocumentsTab() {
  const { user } = useAuth();
  const divisionOptions = user?.divisionScope?.length ? user.divisionScope : DIVISIONS;
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, any>>({});
  const [filterDiv, setFilterDiv] = useState("All");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await Employee.list();
    setEmployees(data);
    setLoading(false);
  };

  const uploadDoc = async (empId: string, field: string, file: File) => {
    setUploading(u => ({ ...u, [`${empId}_${field}`]: true }));
    const { file_url } = await uploadFile(file);
    await Employee.update(empId, { [field]: file_url });
    setUploading(u => ({ ...u, [`${empId}_${field}`]: false }));
    load();
  };

  const updatePVStatus = async (empId: string, status: string) => {
    await Employee.update(empId, { police_verification_status: status });
    load();
  };

  const uploadInternalDoc = async (empId: string, file: File) => {
    setUploading(u => ({ ...u, [`${empId}_internal`]: true }));
    const { file_url } = await uploadFile(file);
    const existing: InternalDoc[] = employees.find(e => e.id === empId)?.internal_documents ?? [];
    const next = [...existing, { label: file.name, url: file_url, uploadedAt: new Date().toISOString() }];
    await Employee.update(empId, { internal_documents: next });
    setUploading(u => ({ ...u, [`${empId}_internal`]: false }));
    load();
  };

  const removeInternalDoc = async (empId: string, index: number) => {
    const existing: InternalDoc[] = employees.find(e => e.id === empId)?.internal_documents ?? [];
    const next = existing.filter((_, i) => i !== index);
    await Employee.update(empId, { internal_documents: next });
    load();
  };

  const filtered = filterDiv === "All" ? employees : employees.filter(e => e.division === filterDiv);

  const idComplete = employees.filter(e => e.id_proof_url).length;
  const contractComplete = employees.filter(e => e.contract_url).length;
  const aadharComplete = employees.filter(e => e.aadhar_url).length;
  const panComplete = employees.filter(e => e.pan_url).length;
  const pvVerified = employees.filter(e => e.police_verification_status === "Verified").length;
  const healthComplete = employees.filter(e => e.health_record_url).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <DashCard>
          <p className="text-xs text-muted-foreground mb-1">ID Proofs</p>
          <p className="text-2xl font-bold text-foreground">{idComplete}<span className="text-sm font-normal text-muted-foreground">/{employees.length}</span></p>
          <p className="text-xs mt-1 text-muted-foreground">uploaded</p>
        </DashCard>
        <DashCard>
          <p className="text-xs text-muted-foreground mb-1">Aadhar</p>
          <p className="text-2xl font-bold text-foreground">{aadharComplete}<span className="text-sm font-normal text-muted-foreground">/{employees.length}</span></p>
          <p className="text-xs mt-1 text-muted-foreground">uploaded</p>
        </DashCard>
        <DashCard>
          <p className="text-xs text-muted-foreground mb-1">PAN</p>
          <p className="text-2xl font-bold text-foreground">{panComplete}<span className="text-sm font-normal text-muted-foreground">/{employees.length}</span></p>
          <p className="text-xs mt-1 text-muted-foreground">uploaded</p>
        </DashCard>
        <DashCard>
          <p className="text-xs text-muted-foreground mb-1">Contracts</p>
          <p className="text-2xl font-bold text-foreground">{contractComplete}<span className="text-sm font-normal text-muted-foreground">/{employees.length}</span></p>
          <p className="text-xs mt-1 text-muted-foreground">signed</p>
        </DashCard>
        <DashCard>
          <p className="text-xs text-muted-foreground mb-1">Police Verification</p>
          <p className="text-2xl font-bold text-foreground">{pvVerified}<span className="text-sm font-normal text-muted-foreground">/{employees.length}</span></p>
          <p className="text-xs mt-1 text-muted-foreground">verified</p>
        </DashCard>
        <DashCard>
          <p className="text-xs text-muted-foreground mb-1">Health Records</p>
          <p className="text-2xl font-bold text-foreground">{healthComplete}<span className="text-sm font-normal text-muted-foreground">/{employees.length}</span></p>
          <p className="text-xs mt-1 text-muted-foreground">on file</p>
        </DashCard>
      </div>

      <DashCard title="Employee Documents">
        <div className="flex gap-2 flex-wrap mb-4">
          {["All", ...divisionOptions].map(d => (
            <button key={d} onClick={() => setFilterDiv(d)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${filterDiv === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
              {d}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No employees found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Employee</th>
                  <th className="text-left py-2 pr-4 font-medium">Department</th>
                  <th className="text-left py-2 pr-4 font-medium">ID Proof</th>
                  <th className="text-left py-2 pr-4 font-medium">Aadhar</th>
                  <th className="text-left py-2 pr-4 font-medium">PAN</th>
                  <th className="text-left py-2 pr-4 font-medium">Offer Letter</th>
                  <th className="text-left py-2 pr-4 font-medium">Contract</th>
                  <th className="text-left py-2 pr-4 font-medium">Police Verif.</th>
                  <th className="text-left py-2 pr-4 font-medium">Health Record</th>
                  <th className="text-left py-2 font-medium">Internal Documents</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => {
                  const PVIcon = pvStatusIcon[emp.police_verification_status] || AlertCircle;
                  return (
                    <tr key={emp.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-foreground">{emp.full_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.role}</p>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{emp.division}</td>
                      <td className="py-3 pr-4">
                        <DocCell empId={emp.id} field="id_proof_url" url={emp.id_proof_url}
                          uploading={!!uploading[`${emp.id}_id_proof_url`]} onUpload={uploadDoc} />
                      </td>
                      <td className="py-3 pr-4">
                        <DocCell empId={emp.id} field="aadhar_url" url={emp.aadhar_url}
                          uploading={!!uploading[`${emp.id}_aadhar_url`]} onUpload={uploadDoc} />
                      </td>
                      <td className="py-3 pr-4">
                        <DocCell empId={emp.id} field="pan_url" url={emp.pan_url}
                          uploading={!!uploading[`${emp.id}_pan_url`]} onUpload={uploadDoc} />
                      </td>
                      <td className="py-3 pr-4">
                        <DocCell empId={emp.id} field="offer_letter_url" url={emp.offer_letter_url}
                          uploading={!!uploading[`${emp.id}_offer_letter_url`]} onUpload={uploadDoc} />
                      </td>
                      <td className="py-3 pr-4">
                        <DocCell empId={emp.id} field="contract_url" url={emp.contract_url}
                          uploading={!!uploading[`${emp.id}_contract_url`]} onUpload={uploadDoc} />
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <DocCell empId={emp.id} field="police_verification_url" url={emp.police_verification_url}
                            uploading={!!uploading[`${emp.id}_police_verification_url`]} onUpload={uploadDoc} />
                          <select value={emp.police_verification_status || "Pending"}
                            onChange={e => updatePVStatus(emp.id, e.target.value)}
                            className="text-xs border border-border rounded-md px-1.5 py-1 bg-background text-foreground focus:outline-none">
                            {["Pending", "Submitted", "Verified", "Rejected"].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <DocCell empId={emp.id} field="health_record_url" url={emp.health_record_url}
                          uploading={!!uploading[`${emp.id}_health_record_url`]} onUpload={uploadDoc} />
                      </td>
                      <td className="py-3">
                        <InternalDocsCell empId={emp.id} docs={emp.internal_documents ?? []}
                          uploading={!!uploading[`${emp.id}_internal`]}
                          onUpload={uploadInternalDoc} onRemove={removeInternalDoc} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>
    </div>
  );
}