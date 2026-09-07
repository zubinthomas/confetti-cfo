import React, { useState, useEffect } from "react";
import { Recruitment } from "@/api/entities";
import { hireApplicant } from "@/api/hrApi";
import { Plus, X, Loader2, UserPlus } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import FormField from "./FormField";
import { DIVISIONS } from "@/lib/hrDivisions";
import { useAuth } from "@/lib/AuthContext";

const EMPTY = { role_title: "", division: "", openings: 1, applicant_name: "", applicant_email: "", applicant_phone: "", stage: "Applied", expected_salary: "", notes: "", checklist: [] as { label: string; done: boolean }[] };

const stageStatus: Record<string, "green" | "amber" | "red"> = { Applied: "amber", Screening: "amber", Interview: "amber", Offer: "green", Hired: "green", Rejected: "red" };

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
const HIREABLE_STAGES = ["Interview", "Offer"];

// Local to the applicant edit form - a small label+checkbox list, same
// {label, done} shape as recruitments.checklist.
function ChecklistEditor({ items, onChange }: { items: { label: string; done: boolean }[]; onChange: (items: { label: string; done: boolean }[]) => void }) {
  const [newLabel, setNewLabel] = useState("");
  const add = () => {
    if (!newLabel.trim()) return;
    onChange([...items, { label: newLabel.trim(), done: false }]);
    setNewLabel("");
  };
  return (
    <div className="sm:col-span-2 space-y-2">
      <label className="text-xs text-muted-foreground block">Onboarding Checklist</label>
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" checked={item.done}
                onChange={(e) => onChange(items.map((it, j) => j === i ? { ...it, done: e.target.checked } : it))}
                className="w-4 h-4"
              />
              <span className={`flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.label}</span>
              <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add a checklist item (e.g. Background check)"
          className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
        />
        <button onClick={add} className="text-sm px-3 py-2 rounded-lg border border-border text-foreground hover:bg-muted">Add</button>
      </div>
    </div>
  );
}

const HIRE_EMPTY = { full_name: "", employee_id: "", division: "", role: "", employment_type: "Full-time", status: "Active", joining_date: "", monthly_salary: "", phone: "", email: "" };

// Pre-fills from the recruitment's own fields - the applicant fills most of
// this in already, hiring just carries it over into a real employee record.
function HireModal({ recruitment, divisionOptions, onClose, onHired }: { recruitment: any; divisionOptions: readonly string[]; onClose: () => void; onHired: () => void }) {
  const [form, setForm] = useState({
    ...HIRE_EMPTY,
    full_name: recruitment.applicant_name || "",
    division: recruitment.division || "",
    role: recruitment.role_title || "",
    email: recruitment.applicant_email || "",
    phone: recruitment.applicant_phone || "",
    monthly_salary: recruitment.expected_salary || "",
    joining_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await hireApplicant(recruitment.id, { ...form, monthly_salary: Number(form.monthly_salary) || 0 });
      onHired();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hire applicant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Hire {recruitment.applicant_name || "Applicant"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Full Name *" name="full_name" value={form.full_name} onChange={updateField} />
          <FormField label="Employee ID" name="employee_id" value={form.employee_id} onChange={updateField} />
          <FormField label="Department *" name="division" options={divisionOptions} value={form.division} onChange={updateField} />
          <FormField label="Role / Designation *" name="role" value={form.role} onChange={updateField} />
          <FormField label="Employment Type" name="employment_type" options={["Full-time", "Part-time", "Contract", "Intern"]} value={form.employment_type} onChange={updateField} />
          <FormField label="Joining Date" name="joining_date" type="date" value={form.joining_date} onChange={updateField} />
          <FormField label="Monthly Salary (₹)" name="monthly_salary" type="number" value={form.monthly_salary} onChange={updateField} />
          <FormField label="Phone" name="phone" value={form.phone} onChange={updateField} />
          <FormField label="Email" name="email" type="email" value={form.email} onChange={updateField} />
        </div>
        {error && <p className="px-6 text-sm text-destructive">{error}</p>}
        <div className="px-6 pb-6 pt-2 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={saving || !form.full_name || !form.division || !form.role} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create Employee
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecruitmentTab() {
  const { user } = useAuth();
  const divisionOptions = user?.divisionScope?.length ? user.divisionScope : DIVISIONS;
  const emptyForm = () => ({ ...EMPTY, division: divisionOptions[0] ?? "" });
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterStage, setFilterStage] = useState("All");
  const [hireTarget, setHireTarget] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await Recruitment.list("-created_date");
    setItems(data);
    setLoading(false);
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = { ...form, openings: Number(form.openings) || 1, expected_salary: Number(form.expected_salary) || 0 };
      if (form.id) await Recruitment.update(form.id, payload);
      else await Recruitment.create(payload);
      setShowForm(false);
      setForm(emptyForm());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save applicant");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      await Recruitment.delete(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete applicant");
    }
  };

  const updateField = (name: string, value: string) => setForm(f => ({ ...f, [name]: value }));

  const filtered = filterStage === "All" ? items : items.filter(i => i.stage === filterStage);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Applicants" value={items.length} />
        <KpiCard label="Active Pipeline" value={items.filter(i => !["Hired","Rejected"].includes(i.stage)).length} status="amber" />
        <KpiCard label="Hired" value={items.filter(i => i.stage === "Hired").length} status="green" />
        <KpiCard label="Rejected" value={items.filter(i => i.stage === "Rejected").length} status="red" />
      </div>

      {/* Pipeline stages summary */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAGES.map(s => (
          <div key={s} className={`text-center p-3 rounded-xl border cursor-pointer transition-all ${filterStage === s ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
            onClick={() => setFilterStage(filterStage === s ? "All" : s)}>
            <p className="text-xl font-bold text-foreground">{items.filter(i => i.stage === s).length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DashCard title="Recruitment Pipeline">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            {["All", ...STAGES].map(s => (
              <button key={s} onClick={() => setFilterStage(s)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition ${filterStage === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
            <Plus className="w-4 h-4" /> Add Applicant
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No applicants in this stage.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Applicant</th>
                  <th className="text-left py-2 pr-4 font-medium">Role</th>
                  <th className="text-left py-2 pr-4 font-medium">Department</th>
                  <th className="text-left py-2 pr-4 font-medium">Stage</th>
                  <th className="text-left py-2 pr-4 font-medium">Expected Sal.</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-foreground">{item.applicant_name || "-"}</p>
                      <p className="text-xs text-muted-foreground">{item.applicant_email}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.role_title}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.division}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={stageStatus[item.stage]}>{item.stage}</StatusBadge></td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.expected_salary ? `₹${Number(item.expected_salary).toLocaleString()}` : "-"}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        {HIREABLE_STAGES.includes(item.stage) && !item.converted_employee_id && (
                          <button onClick={() => setHireTarget(item)} className="flex items-center gap-1 text-xs text-emerald-600 hover:underline">
                            <UserPlus className="w-3.5 h-3.5" /> Hire
                          </button>
                        )}
                        {item.converted_employee_id && <span className="text-xs text-muted-foreground">Hired</span>}
                        <button onClick={() => { setForm({ ...item, checklist: item.checklist ?? [] }); setShowForm(true); }} className="text-xs text-primary hover:underline">Edit</button>
                        <button onClick={() => remove(item.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">{form.id ? "Edit Applicant" : "Add Applicant"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Role Title *" name="role_title" value={form.role_title ?? ""} onChange={updateField} />
              <FormField label="Department *" name="division" options={divisionOptions} value={form.division ?? ""} onChange={updateField} />
              <FormField label="No. of Openings" name="openings" type="number" value={form.openings ?? ""} onChange={updateField} />
              <FormField label="Stage" name="stage" options={STAGES} value={form.stage ?? ""} onChange={updateField} />
              <FormField label="Applicant Name" name="applicant_name" value={form.applicant_name ?? ""} onChange={updateField} />
              <FormField label="Applicant Email" name="applicant_email" type="email" value={form.applicant_email ?? ""} onChange={updateField} />
              <FormField label="Applicant Phone" name="applicant_phone" value={form.applicant_phone ?? ""} onChange={updateField} />
              <FormField label="Expected Salary (₹/mo)" name="expected_salary" type="number" value={form.expected_salary ?? ""} onChange={updateField} />
              <div className="sm:col-span-2"><FormField label="Notes" name="notes" value={form.notes ?? ""} onChange={updateField} /></div>
              <ChecklistEditor items={form.checklist ?? []} onChange={(checklist) => setForm((f) => ({ ...f, checklist }))} />
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

      {hireTarget && (
        <HireModal recruitment={hireTarget} divisionOptions={divisionOptions} onClose={() => setHireTarget(null)} onHired={load} />
      )}
    </div>
  );
}