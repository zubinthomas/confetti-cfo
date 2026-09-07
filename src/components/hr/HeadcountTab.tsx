import React, { useState, useEffect } from "react";
import { Employee, PayrollRecord, EmployeeExit } from "@/api/entities";
import { createInvite } from "@/api/invitesApi";
import { uploadFile } from "@/api/integrations";
import { offboardEmployee, type OffboardInput } from "@/api/hrApi";
import { generateSalarySlip, generateIdCard, monthLabel, type EmployeeDocInfo } from "@/lib/employeeDocs";
import { Plus, X, Loader2, Copy, Check, ImagePlus, IdCard, ArrowUp, ArrowDown, ArrowUpDown, RotateCcw, UserMinus } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import FormField from "./FormField";
import EmployeeDocumentsPanel from "./EmployeeDocumentsPanel";
import { useAuth } from "@/lib/AuthContext";
import { DIVISIONS } from "@/lib/hrDivisions";

const divisionColors: Record<string, string> = {
  Accounts: "#f59e0b", Admin: "#8b5cf6", "Batik Unit": "#ec4899", Culinary: "#ef4444",
  Driver: "#64748b", "F&B Services": "#f97316", Jewellery: "#eab308", Legal: "#6366f1",
  Marketing: "#14b8a6", Partner: "#a855f7", Pottery: "#3b82f6", "Quality Control": "#06b6d4",
  Retail: "#84cc16", Tailor: "#d946ef", Utility: "#10b981",
};
const DEFAULT_DIVISION_COLOR = "#888";

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Intern"];
const STATUSES = ["Active", "On Leave", "Terminated", "Probation"];
type SortKey = "full_name" | "division" | "role" | "employment_type" | "status" | "monthly_salary";

const EMPTY = { full_name: "", employee_id: "", division: "", role: "", employment_type: "Full-time", status: "Active", joining_date: "", monthly_salary: "", phone: "", email: "", aadhar_number: "", pan_number: "", blood_group: "", emergency_contact_name: "", emergency_contact_phone: "", address: "", notes: "", photo_url: "", manager_id: "" };

const toDocInfo = (emp: any): EmployeeDocInfo => ({
  fullName: emp.full_name ?? null,
  employeeId: emp.employee_id ?? null,
  division: emp.division ?? null,
  role: emp.role ?? null,
  photoUrl: emp.photo_url ?? null,
});

// Local to the employee detail modal - fetched records are already filtered
// to this one employee by the caller.
const PAYROLL_COMPONENTS: { field: string; label: string; sign: 1 | -1 }[] = [
  { field: "basic_pay", label: "Basic Pay", sign: 1 },
  { field: "hra", label: "HRA", sign: 1 },
  { field: "other_allowances", label: "Other Allowances", sign: 1 },
  { field: "bonus", label: "Bonus", sign: 1 },
  { field: "pf_deduction", label: "PF", sign: -1 },
  { field: "tax_deduction", label: "Tax", sign: -1 },
  { field: "other_deductions", label: "Other Deductions", sign: -1 },
];
const EMPTY_COMPONENTS = Object.fromEntries(PAYROLL_COMPONENTS.map((c) => [c.field, ""]));

function PayrollSection({ employee, records, canRecord, onRecorded }: {
  employee: any; records: any[]; canRecord: boolean; onRecorded: () => void;
}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState(String(employee.monthly_salary ?? ""));
  const [itemize, setItemize] = useState(false);
  const [components, setComponents] = useState<Record<string, string>>(EMPTY_COMPONENTS);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...records].sort((a, b) => b.month.localeCompare(a.month));
  const alreadyRecorded = sorted.some((r) => r.month === month);

  const applyItemizedTotal = (next: Record<string, string>) => {
    const total = PAYROLL_COMPONENTS.reduce((sum, c) => sum + c.sign * (Number(next[c.field]) || 0), 0);
    setAmount(String(total));
  };

  const record = async () => {
    setError("");
    setRecording(true);
    try {
      const componentValues = itemize
        ? Object.fromEntries(PAYROLL_COMPONENTS.map((c) => [c.field, components[c.field] ? Number(components[c.field]) : null]))
        : {};
      await PayrollRecord.create({
        employee_id: employee.id,
        division: employee.division,
        month,
        gross_salary: Number(amount) || 0,
        ...componentValues,
      });
      setComponents(EMPTY_COMPONENTS);
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
                  onClick={() => generateSalarySlip(toDocInfo(employee), {
                    month: r.month, grossSalary: r.gross_salary,
                    basicPay: r.basic_pay, hra: r.hra, otherAllowances: r.other_allowances, bonus: r.bonus,
                    pfDeduction: r.pf_deduction, taxDeduction: r.tax_deduction, otherDeductions: r.other_deductions,
                  })}
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
          <button onClick={() => setItemize((v) => !v)} className="text-xs text-muted-foreground hover:text-primary underline">
            {itemize ? "Hide breakdown" : "Itemize"}
          </button>
        </div>
      )}
      {canRecord && itemize && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          {PAYROLL_COMPONENTS.map((c) => (
            <div key={c.field} className="space-y-1">
              <label className="text-xs text-muted-foreground">{c.label}</label>
              <input
                type="number" value={components[c.field]}
                onChange={(e) => setComponents((prev) => {
                  const next = { ...prev, [c.field]: e.target.value };
                  applyItemizedTotal(next);
                  return next;
                })}
                className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
              />
            </div>
          ))}
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

const EXIT_TYPES = ["resignation", "termination", "end_of_contract"] as const;
const exitTypeLabel: Record<string, string> = { resignation: "Resignation", termination: "Termination", end_of_contract: "End of Contract" };

function OffboardModal({ employee, onClose, onOffboarded }: { employee: any; onClose: () => void; onOffboarded: () => void }) {
  const [form, setForm] = useState<OffboardInput>({
    exit_type: "resignation",
    notice_date: "",
    last_working_date: "",
    reason: "",
    exit_interview_notes: "",
    assets_returned: false,
    full_settlement_done: false,
    rehire_eligible: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await offboardEmployee(employee.id, form);
      onOffboarded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to offboard employee");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Offboard {employee.full_name}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground block">Exit Type</label>
            <select
              value={form.exit_type} onChange={(e) => setForm((f) => ({ ...f, exit_type: e.target.value as OffboardInput["exit_type"] }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              {EXIT_TYPES.map((t) => <option key={t} value={t}>{exitTypeLabel[t]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground block">Notice Date</label>
              <input type="date" value={form.notice_date} onChange={(e) => setForm((f) => ({ ...f, notice_date: e.target.value }))} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground block">Last Working Date</label>
              <input type="date" value={form.last_working_date} onChange={(e) => setForm((f) => ({ ...f, last_working_date: e.target.value }))} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground block">Reason</label>
            <input type="text" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground block">Exit Interview Notes</label>
            <textarea value={form.exit_interview_notes} onChange={(e) => setForm((f) => ({ ...f, exit_interview_notes: e.target.value }))} rows={2} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground" />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.assets_returned} onChange={(e) => setForm((f) => ({ ...f, assets_returned: e.target.checked }))} /> Assets returned
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.full_settlement_done} onChange={(e) => setForm((f) => ({ ...f, full_settlement_done: e.target.checked }))} /> Full settlement done
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.rehire_eligible} onChange={(e) => setForm((f) => ({ ...f, rehire_eligible: e.target.checked }))} /> Rehire eligible
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Confirm Offboarding
          </button>
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
  const canOffboard = can("Employee", "write") && can("EmployeeExit", "write");
  const canExitRead = can("EmployeeExit", "read");
  // A scoped manager's dropdown only offers their own division(s); an
  // unscoped user (the default) sees the full list, matching today's
  // behavior. The server enforces this either way - this is just so a
  // scoped manager doesn't hit an avoidable 403 for the common case.
  const divisionOptions = user?.divisionScope?.length ? user.divisionScope : DIVISIONS;
  const emptyForm = () => ({ ...EMPTY, division: divisionOptions[0] ?? "" });
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [exits, setExits] = useState<any[]>([]);
  const [offboardTarget, setOffboardTarget] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [inviteTarget, setInviteTarget] = useState<any | null>(null);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ division: "", role: "", employment_type: "", status: "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [empData, payrollData, exitData] = await Promise.all([
      Employee.list(),
      canPayrollRead ? PayrollRecord.list() : Promise.resolve([]),
      canExitRead ? EmployeeExit.list() : Promise.resolve([]),
    ]);
    setEmployees(empData);
    setPayrollRecords(payrollData);
    setExits(exitData);
    setLoading(false);
    // Keep an open detail modal showing live data (e.g. right after a
    // document upload) instead of the stale snapshot it was opened with.
    setSelected((prev: any) => prev ? (empData.find((e) => e.id === prev.id) ?? null) : prev);
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

  const roleOptions = Array.from(new Set(employees.map(e => e.role).filter(Boolean))).sort();
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ division: "", role: "", employment_type: "", status: "" });

  const filteredEmployees = employees.filter(e =>
    (!filters.division || e.division === filters.division) &&
    (!filters.role || e.role === filters.role) &&
    (!filters.employment_type || e.employment_type === filters.employment_type) &&
    (!filters.status || e.status === filters.status)
  );

  // No sort selected = the order records were loaded in (the "default" order
  // a Reset sort click restores).
  const visibleEmployees = sort ? [...filteredEmployees].sort((a, b) => {
    const { key, dir } = sort;
    const cmp = key === "monthly_salary"
      ? (Number(a[key]) || 0) - (Number(b[key]) || 0)
      : String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
    return dir === "asc" ? cmp : -cmp;
  }) : filteredEmployees;

  const toggleSort = (key: SortKey) => setSort(prev => {
    if (!prev || prev.key !== key) return { key, dir: "asc" };
    if (prev.dir === "asc") return { key, dir: "desc" };
    return null;
  });

  const sortableHeader = (label: string, key: SortKey) => (
    <th
      onClick={() => toggleSort(key)}
      className="text-left py-2 pr-4 font-medium cursor-pointer select-none hover:text-foreground"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sort?.key === key
          ? (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Employees" value={employees.length} sub={`${employees.filter(e=>e.status==="Active").length} active`} status="green" />
        <KpiCard label="Total Payroll / mo" value={`₹${(totalPayroll/100000).toFixed(1)}L`} sub="All divisions" status={totalPayroll/100000 > 8.4 ? "red" : "green"} />
        <KpiCard label="On Leave" value={employees.filter(e=>e.status==="On Leave").length} sub="Today" status="amber" />
        <KpiCard label="Contract Staff" value={employees.filter(e=>e.employment_type==="Contract").length} sub="Contractors" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {divStats.map(d => (
          <DashCard key={d.name}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: divisionColors[d.name] || DEFAULT_DIVISION_COLOR }} />
              <span className="text-sm font-medium text-foreground">{d.name}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{d.count}</p>
            {d.payroll ? 
              <p className="text-xs text-muted-foreground mt-1">Payroll: ₹{(d.payroll/1000).toFixed(0)}K/mo</p> :
              <p className="text-xs text-muted-foreground mt-1"></p>
            }
          </DashCard>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DashCard title="Employee Directory">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.division} onChange={(e) => setFilters(f => ({ ...f, division: e.target.value }))}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            >
              <option value="">All Departments</option>
              {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={filters.role} onChange={(e) => setFilters(f => ({ ...f, role: e.target.value }))}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            >
              <option value="">All Roles</option>
              {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={filters.employment_type} onChange={(e) => setFilters(f => ({ ...f, employment_type: e.target.value }))}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            >
              <option value="">All Types</option>
              {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            >
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-primary underline">
                Clear filters
              </button>
            )}
            {sort && (
              <button onClick={() => setSort(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                <RotateCcw className="w-3.5 h-3.5" /> Reset sort
              </button>
            )}
          </div>
          {canWrite && (
            <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
              className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
              <Plus className="w-4 h-4" /> Add Employee
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No employees yet. Add your first employee.</p>
        ) : visibleEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No employees match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  {sortableHeader("Name", "full_name")}
                  {sortableHeader("Department", "division")}
                  {sortableHeader("Role", "role")}
                  {sortableHeader("Type", "employment_type")}
                  {sortableHeader("Status", "status")}
                  {sortableHeader("Salary/mo", "monthly_salary")}
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map(emp => (
                  <tr key={emp.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <button onClick={() => setSelected(emp)} className="font-medium text-foreground hover:text-primary text-left">{emp.full_name}</button>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </td>
                    <td className="py-2.5 pr-4"><span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: (divisionColors[emp.division] || DEFAULT_DIVISION_COLOR) + "20", color: divisionColors[emp.division] || DEFAULT_DIVISION_COLOR }}>{emp.division}</span></td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{emp.role}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{emp.employment_type}</td>
                    <td className="py-2.5 pr-4"><span className={`text-xs font-medium ${statusColor[emp.status] || ""}`}>{emp.status}</span></td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{emp.monthly_salary ? `₹${emp.monthly_salary.toLocaleString()}` : "-"}</td>
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
              <FormField label="Department *" name="division" options={divisionOptions} value={form.division ?? ""} onChange={updateField} />
              <FormField label="Role / Designation *" name="role" value={form.role ?? ""} onChange={updateField} />
              <FormField label="Employment Type" name="employment_type" options={EMPLOYMENT_TYPES} value={form.employment_type ?? ""} onChange={updateField} />
              <FormField label="Status" name="status" options={STATUSES} value={form.status ?? ""} onChange={updateField} />
              <FormField label="Joining Date" name="joining_date" type="date" value={form.joining_date ?? ""} onChange={updateField} />
              <FormField label="Monthly Salary (₹)" name="monthly_salary" type="number" value={form.monthly_salary ?? ""} onChange={updateField} />
              <FormField label="Phone" name="phone" value={form.phone ?? ""} onChange={updateField} />
              <FormField label="Email" name="email" type="email" value={form.email ?? ""} onChange={updateField} />
              <FormField label="Aadhar Number" name="aadhar_number" value={form.aadhar_number ?? ""} onChange={updateField} />
              <FormField label="PAN Number" name="pan_number" value={form.pan_number ?? ""} onChange={updateField} />
              <FormField label="Blood Group" name="blood_group" value={form.blood_group ?? ""} onChange={updateField} />
              <FormField label="Emergency Contact Name" name="emergency_contact_name" value={form.emergency_contact_name ?? ""} onChange={updateField} />
              <FormField label="Emergency Contact Phone" name="emergency_contact_phone" value={form.emergency_contact_phone ?? ""} onChange={updateField} />
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Manager</label>
                <select
                  value={form.manager_id ?? ""} onChange={(e) => updateField("manager_id", e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">None</option>
                  {employees.filter((e) => e.id !== form.id).map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}{e.role ? ` — ${e.role}` : ""}</option>
                  ))}
                </select>
              </div>
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
              {[["Department", selected.division], ["Role", selected.role], ["Manager", employees.find((e) => e.id === selected.manager_id)?.full_name || selected.reporting_manager], ["Location", selected.location], ["Pottery Grade", selected.pottery_grade], ["Type", selected.employment_type], ["Status", selected.status], ["Joining Date", selected.joining_date], ["Salary/mo", selected.monthly_salary ? `₹${selected.monthly_salary.toLocaleString()}` : "-"], ["Gender", selected.gender], ["Date of Birth", selected.date_of_birth], ["Phone", selected.phone], ["Email", selected.email], ["Aadhar", selected.aadhar_number], ["PAN", selected.pan_number], ["Blood Group", selected.blood_group], ["Bank Account", selected.bank_account_number], ["IFSC", selected.ifsc_code], ["Emergency Contact", selected.emergency_contact_name ? `${selected.emergency_contact_name}${selected.emergency_contact_relation ? ` (${selected.emergency_contact_relation})` : ""} - ${selected.emergency_contact_phone}` : "-"]].map(([k, v]) => v ? (
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

            <div className="px-6 pb-6 pt-3 border-t border-border">
              <EmployeeDocumentsPanel employee={selected} canWrite={canWrite} onChange={load} />
            </div>

            {(canExitRead || canOffboard) && (() => {
              const exitRecords = exits.filter((e) => e.employee_id === selected.id);
              return (
                <div className="px-6 pb-3 space-y-2">
                  {exitRecords.map((e) => (
                    <div key={e.id} className="text-xs bg-muted/40 rounded-lg p-3 space-y-1">
                      <p className="font-medium text-foreground">{exitTypeLabel[e.exit_type] || e.exit_type}{e.last_working_date ? ` · Last day ${e.last_working_date}` : ""}</p>
                      {e.reason && <p className="text-muted-foreground">{e.reason}</p>}
                    </div>
                  ))}
                  {canOffboard && selected.status !== "Terminated" && (
                    <button
                      onClick={() => setOffboardTarget(selected)}
                      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <UserMinus className="w-4 h-4" /> Offboard Employee
                    </button>
                  )}
                </div>
              );
            })()}

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

      {offboardTarget && (
        <OffboardModal
          employee={offboardTarget}
          onClose={() => setOffboardTarget(null)}
          onOffboarded={() => { load(); setSelected(null); }}
        />
      )}
    </div>
  );
}