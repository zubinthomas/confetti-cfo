import React, { useState, useEffect } from "react";
import { Employee, PayrollRecord } from "@/api/entities";
import { createInvite } from "@/api/invitesApi";
import { uploadFile } from "@/api/integrations";
import { generateSalarySlip, generateIdCard, monthLabel, type EmployeeDocInfo } from "@/lib/employeeDocs";
import { Plus, X, Loader2, Copy, Check, ImagePlus, IdCard } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import FormField from "./FormField";
import { useAuth } from "@/lib/AuthContext";
import { DIVISIONS } from "@/lib/hrDivisions";

const divisionColors: Record<string, string> = { Ceramics: "#3b82f6", Textiles: "#10b981", Siena: "#f59e0b", Admin: "#8b5cf6" };

const EMPTY = { full_name: "", employee_id: "", division: "", role: "", employment_type: "Full-time", status: "Active", joining_date: "", monthly_salary: "", phone: "", email: "", aadhar_number: "", pan_number: "", blood_group: "", emergency_contact_name: "", emergency_contact_phone: "", address: "", notes: "", photo_url: "" };

const toDocInfo = (emp: any): EmployeeDocInfo => ({
  fullName: emp.full_name ?? null,
  employeeId: emp.employee_id ?? null,
  division: emp.division ?? null,
  role: emp.role ?? null,
  photoUrl: emp.photo_url ?? null,
});

// Local to the employee detail modal - fetched records are already filtered
// to this one employee by the caller.
function PayrollSection({ employee, records, canRecord, onRecorded }: {
  employee: any; records: any[]; canRecord: boolean; onRecorded: () => void;
}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState(String(employee.monthly_salary ?? ""));
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...records].sort((a, b) => b.month.localeCompare(a.month));
  const alreadyRecorded = sorted.some((r) => r.month === month);

  const record = async () => {
    setError("");
    setRecording(true);
    try {
      await PayrollRecord.create({
        employee_id: employee.id,
        division: employee.division,
        month,
        gross_salary: Number(amount) || 0,
      });
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payroll");
    } finally {
      setRecording(false);
    }
  };

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">Payroll</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-2">No payroll recorded yet.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {sorted.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{monthLabel(r.month)}</span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">₹{(r.gross_salary || 0).toLocaleString()}</span>
                <button
                  onClick={() => generateSalarySlip(toDocInfo(employee), { month: r.month, grossSalary: r.gross_salary })}
                  className="text-xs text-primary hover:underline"
                >
                  Download Slip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {canRecord && (
        <div className="flex items-end gap-2 pt-2 border-t border-border flex-wrap">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Month</label>
            <input
              type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Gross Salary</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground w-28"
            />
          </div>
          <button
            onClick={record} disabled={recording || alreadyRecorded}
            title={alreadyRecorded ? "Already recorded for this month" : undefined}
            className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {recording && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Record
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}

// The employee only ever gets a curated, read-only view of their own record
// (see server/db/employeeSelf.ts) - the invite itself carries no
// permissions at all, so there's nothing to pick here beyond the email.
function InviteSelfServiceModal({ employee, onClose, onSent }: { employee: any; onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState(employee.email || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const send = async () => {
    setError("");
    setSending(true);
    try {
      const invite = await createInvite(email, [], employee.id);
      setToken(invite.token);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setSending(false);
    }
  };

  const url = token ? `${window.location.origin}/invite/${token}` : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Invite to self-service</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          {!token ? (
            <>
              <p className="text-sm text-muted-foreground">
                {employee.full_name} will be able to log in and view their own profile, salary, and documents - nothing else.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-emerald-600">Invite created.</p>
              <button
                onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy invite link</>}
              </button>
            </div>
          )}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          {!token ? (
            <>
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
              <button
                onClick={send} disabled={sending || !email}
                className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />} Send invite
              </button>
            </>
          ) : (
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HeadcountTab() {
  const { user, can } = useAuth();
  const canWrite = can("Employee", "write");
  const canDelete = can("Employee", "delete");
  const canInvite = can("Invite", "write");
  const canPayrollRead = can("PayrollRecord", "read");
  const canPayrollWrite = can("PayrollRecord", "write");
  // A scoped manager's dropdown only offers their own division(s); an
  // unscoped user (the default) sees the full list, matching today's
  // behavior. The server enforces this either way - this is just so a
  // scoped manager doesn't hit an avoidable 403 for the common case.
  const divisionOptions = user?.divisionScope?.length ? user.divisionScope : DIVISIONS;
  const emptyForm = () => ({ ...EMPTY, division: divisionOptions[0] ?? "" });
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [inviteTarget, setInviteTarget] = useState<any | null>(null);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [empData, payrollData] = await Promise.all([
      Employee.list(),
      canPayrollRead ? PayrollRecord.list() : Promise.resolve([]),
    ]);
    setEmployees(empData);
    setPayrollRecords(payrollData);
    setLoading(false);
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = { ...form, monthly_salary: Number(form.monthly_salary) || 0 };
      if (form.id) await Employee.update(form.id, payload);
      else await Employee.create(payload);
      setShowForm(false);
      setForm(emptyForm());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      await Employee.delete(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete employee");
    }
  };

  const uploadPhoto = async (file: File) => {
    setError("");
    setPhotoUploading(true);
    try {
      const { file_url } = await uploadFile(file);
      setForm((f) => ({ ...f, photo_url: file_url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setPhotoUploading(false);
    }
  };

  const downloadIdCard = async (emp: any) => {
    setGeneratingCard(true);
    try {
      await generateIdCard(toDocInfo(emp));
    } finally {
      setGeneratingCard(false);
    }
  };

  const divStats = DIVISIONS.map(d => ({
    name: d,
    count: employees.filter(e => e.division === d).length,
    payroll: employees.filter(e => e.division === d).reduce((s, e) => s + (e.monthly_salary || 0), 0),
  }));

  const totalPayroll = employees.reduce((s, e) => s + (e.monthly_salary || 0), 0);

  const updateField = (name: string, value: string) => setForm(f => ({ ...f, [name]: value }));

  const statusColor: Record<string, string> = { Active: "text-emerald-600", "On Leave": "text-amber-600", Terminated: "text-red-600", Probation: "text-blue-600" };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Employees" value={employees.length} sub={`${employees.filter(e=>e.status==="Active").length} active`} status="green" />
        <KpiCard label="Total Payroll / mo" value={`₹${(totalPayroll/100000).toFixed(1)}L`} sub="All divisions" status={totalPayroll/100000 > 8.4 ? "red" : "green"} />
        <KpiCard label="On Leave" value={employees.filter(e=>e.status==="On Leave").length} sub="Today" status="amber" />
        <KpiCard label="Contract Staff" value={employees.filter(e=>e.employment_type==="Contract").length} sub="Contractors" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {divStats.map(d => (
          <DashCard key={d.name}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: divisionColors[d.name] }} />
              <span className="text-sm font-medium text-foreground">{d.name}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{d.count}</p>
            <p className="text-xs text-muted-foreground mt-1">Payroll: ₹{(d.payroll/1000).toFixed(0)}K/mo</p>
          </DashCard>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DashCard title="Employee Directory">
        {canWrite && (
          <div className="flex justify-end mb-3">
            <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
              className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
              <Plus className="w-4 h-4" /> Add Employee
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No employees yet. Add your first employee.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Name</th>
                  <th className="text-left py-2 pr-4 font-medium">Division</th>
                  <th className="text-left py-2 pr-4 font-medium">Role</th>
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Salary/mo</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <button onClick={() => setSelected(emp)} className="font-medium text-foreground hover:text-primary text-left">{emp.full_name}</button>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </td>
                    <td className="py-2.5 pr-4"><span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: divisionColors[emp.division] + "20", color: divisionColors[emp.division] }}>{emp.division}</span></td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{emp.role}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{emp.employment_type}</td>
                    <td className="py-2.5 pr-4"><span className={`text-xs font-medium ${statusColor[emp.status] || ""}`}>{emp.status}</span></td>
                    <td className="py-2.5 pr-4 text-muted-foreground">₹{(emp.monthly_salary||0).toLocaleString()}</td>
                    <td className="py-2.5">
                      <div className="flex gap-2">
                        {canWrite && <button onClick={() => { setForm({ ...emp }); setShowForm(true); }} className="text-xs text-primary hover:underline">Edit</button>}
                        {canDelete && <button onClick={() => remove(emp.id)} className="text-xs text-red-500 hover:underline">Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">{form.id ? "Edit Employee" : "Add Employee"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs text-muted-foreground block">Photo</label>
                <div className="flex items-center gap-3">
                  {form.photo_url && (
                    <img src={form.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
                  )}
                  <label className="cursor-pointer flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg border border-border">
                    <input
                      type="file" accept="image/*" className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                    />
                    {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    {form.photo_url ? "Change photo" : "Upload photo"}
                  </label>
                </div>
              </div>
              <FormField label="Full Name *" name="full_name" value={form.full_name ?? ""} onChange={updateField} />
              <FormField label="Employee ID" name="employee_id" value={form.employee_id ?? ""} onChange={updateField} />
              <FormField label="Division *" name="division" options={divisionOptions} value={form.division ?? ""} onChange={updateField} />
              <FormField label="Role / Designation *" name="role" value={form.role ?? ""} onChange={updateField} />
              <FormField label="Employment Type" name="employment_type" options={["Full-time", "Part-time", "Contract", "Intern"]} value={form.employment_type ?? ""} onChange={updateField} />
              <FormField label="Status" name="status" options={["Active", "On Leave", "Terminated", "Probation"]} value={form.status ?? ""} onChange={updateField} />
              <FormField label="Joining Date" name="joining_date" type="date" value={form.joining_date ?? ""} onChange={updateField} />
              <FormField label="Monthly Salary (₹)" name="monthly_salary" type="number" value={form.monthly_salary ?? ""} onChange={updateField} />
              <FormField label="Phone" name="phone" value={form.phone ?? ""} onChange={updateField} />
              <FormField label="Email" name="email" type="email" value={form.email ?? ""} onChange={updateField} />
              <FormField label="Aadhar Number" name="aadhar_number" value={form.aadhar_number ?? ""} onChange={updateField} />
              <FormField label="PAN Number" name="pan_number" value={form.pan_number ?? ""} onChange={updateField} />
              <FormField label="Blood Group" name="blood_group" value={form.blood_group ?? ""} onChange={updateField} />
              <FormField label="Emergency Contact Name" name="emergency_contact_name" value={form.emergency_contact_name ?? ""} onChange={updateField} />
              <FormField label="Emergency Contact Phone" name="emergency_contact_phone" value={form.emergency_contact_phone ?? ""} onChange={updateField} />
              <div className="sm:col-span-2"><FormField label="Address" name="address" value={form.address ?? ""} onChange={updateField} /></div>
              <div className="sm:col-span-2"><FormField label="Notes" name="notes" value={form.notes ?? ""} onChange={updateField} /></div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selected.photo_url && (
                  <img src={selected.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-border" />
                )}
                <h2 className="text-base font-semibold text-foreground">{selected.full_name}</h2>
              </div>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              {[["Division", selected.division], ["Role", selected.role], ["Type", selected.employment_type], ["Status", selected.status], ["Joining Date", selected.joining_date], ["Salary/mo", selected.monthly_salary ? `₹${selected.monthly_salary.toLocaleString()}` : "-"], ["Phone", selected.phone], ["Email", selected.email], ["Aadhar", selected.aadhar_number], ["PAN", selected.pan_number], ["Blood Group", selected.blood_group], ["Emergency Contact", selected.emergency_contact_name ? `${selected.emergency_contact_name} - ${selected.emergency_contact_phone}` : "-"]].map(([k, v]) => v ? (
                <div key={k} className="flex justify-between border-b border-border pb-2 last:border-b-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium text-right">{v}</span>
                </div>
              ) : null)}
              {selected.address && <div className="border-b border-border pb-2"><span className="text-muted-foreground block mb-1">Address</span><span className="text-foreground">{selected.address}</span></div>}
            </div>

            <div className="px-6 pb-3">
              <button
                onClick={() => downloadIdCard(selected)} disabled={generatingCard}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50"
              >
                {generatingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <IdCard className="w-4 h-4" />} Download ID Card
              </button>
            </div>

            {canPayrollRead && (
              <div className="px-6 pb-6 pt-3 border-t border-border">
                <PayrollSection
                  employee={selected}
                  records={payrollRecords.filter((r) => r.employee_id === selected.id)}
                  canRecord={canPayrollWrite}
                  onRecorded={load}
                />
              </div>
            )}

            {canInvite && (
              <div className="px-6 pb-6">
                {selected.user_id ? (
                  <p className="text-xs text-muted-foreground">This employee already has a self-service login.</p>
                ) : (
                  <button
                    onClick={() => setInviteTarget(selected)}
                    className="text-sm text-primary hover:underline"
                  >
                    Invite to self-service
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {inviteTarget && (
        <InviteSelfServiceModal
          employee={inviteTarget}
          onClose={() => setInviteTarget(null)}
          onSent={load}
        />
      )}
    </div>
  );
}