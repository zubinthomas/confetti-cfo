import React, { useState, useEffect } from "react";
import { Employee } from "@/api/entities";
import { uploadFile } from "@/api/integrations";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Clock, XCircle } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";

const pvStatusIcon: Record<string, React.ComponentType<{ className?: string }>> = { Verified: CheckCircle2, Submitted: Clock, Pending: AlertCircle, Rejected: XCircle };
const pvStatusColor: Record<string, string> = { Verified: "text-emerald-500", Submitted: "text-blue-500", Pending: "text-amber-500", Rejected: "text-red-500" };
const pvBadge: Record<string, string> = { Verified: "green", Submitted: "green", Pending: "amber", Rejected: "red" };

export default function DocumentsTab() {
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

  const filtered = filterDiv === "All" ? employees : employees.filter(e => e.division === filterDiv);

  const DocCell = ({ empId, field, url, label }: { empId: string; field: string; url?: string; label: string }) => {
    const key = `${empId}_${field}`;
    return (
      <div className="flex items-center gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <FileText className="w-3.5 h-3.5" /> View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        <label className="cursor-pointer">
          <input type="file" className="hidden" onChange={e => e.target.files[0] && uploadDoc(empId, field, e.target.files[0])} />
          {uploading[key] ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
          )}
        </label>
      </div>
    );
  };

  const idComplete = employees.filter(e => e.id_proof_url).length;
  const contractComplete = employees.filter(e => e.contract_url).length;
  const pvVerified = employees.filter(e => e.police_verification_status === "Verified").length;
  const healthComplete = employees.filter(e => e.health_record_url).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashCard>
          <p className="text-xs text-muted-foreground mb-1">ID Proofs</p>
          <p className="text-2xl font-bold text-foreground">{idComplete}<span className="text-sm font-normal text-muted-foreground">/{employees.length}</span></p>
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
          {["All", "Ceramics", "Textiles", "Siena", "Admin"].map(d => (
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
                  <th className="text-left py-2 pr-4 font-medium">Division</th>
                  <th className="text-left py-2 pr-4 font-medium">ID Proof</th>
                  <th className="text-left py-2 pr-4 font-medium">Contract</th>
                  <th className="text-left py-2 pr-4 font-medium">Police Verif.</th>
                  <th className="text-left py-2 font-medium">Health Record</th>
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
                        <DocCell empId={emp.id} field="id_proof_url" url={emp.id_proof_url} label="ID Proof" />
                      </td>
                      <td className="py-3 pr-4">
                        <DocCell empId={emp.id} field="contract_url" url={emp.contract_url} label="Contract" />
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <DocCell empId={emp.id} field="police_verification_url" url={emp.police_verification_url} label="PV" />
                          <select value={emp.police_verification_status || "Pending"}
                            onChange={e => updatePVStatus(emp.id, e.target.value)}
                            className="text-xs border border-border rounded-md px-1.5 py-1 bg-background text-foreground focus:outline-none">
                            {["Pending", "Submitted", "Verified", "Rejected"].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="py-3">
                        <DocCell empId={emp.id} field="health_record_url" url={emp.health_record_url} label="Health" />
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