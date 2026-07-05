import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, X, Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import StatusBadge from "@/components/dashboard/StatusBadge";

const EMPTY = { role_title: "", division: "Ceramics", openings: 1, applicant_name: "", applicant_email: "", applicant_phone: "", stage: "Applied", expected_salary: "", notes: "" };

const stageStatus = { Applied: "amber", Screening: "amber", Interview: "amber", Offer: "green", Hired: "green", Rejected: "red" };

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];

export default function RecruitmentTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filterStage, setFilterStage] = useState("All");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Recruitment.list("-created_date");
    setItems(data);
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload = { ...form, openings: Number(form.openings) || 1, expected_salary: Number(form.expected_salary) || 0 };
    if (form.id) await base44.entities.Recruitment.update(form.id, payload);
    else await base44.entities.Recruitment.create(payload);
    setSaving(false);
    setShowForm(false);
    setForm(EMPTY);
    load();
  };

  const remove = async (id) => { await base44.entities.Recruitment.delete(id); load(); };

  const Field = ({ label, name, type = "text", options }) => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {options ? (
        <select value={form[name] || ""} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={form[name] || ""} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
      )}
    </div>
  );

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
          <button onClick={() => { setForm(EMPTY); setShowForm(true); }}
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
                  <th className="text-left py-2 pr-4 font-medium">Division</th>
                  <th className="text-left py-2 pr-4 font-medium">Stage</th>
                  <th className="text-left py-2 pr-4 font-medium">Expected Sal.</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-foreground">{item.applicant_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{item.applicant_email}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.role_title}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.division}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={stageStatus[item.stage]}>{item.stage}</StatusBadge></td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.expected_salary ? `₹${Number(item.expected_salary).toLocaleString()}` : "—"}</td>
                    <td className="py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => { setForm({ ...item }); setShowForm(true); }} className="text-xs text-primary hover:underline">Edit</button>
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
              <Field label="Role Title *" name="role_title" />
              <Field label="Division *" name="division" options={["Ceramics", "Textiles", "Siena", "Admin"]} />
              <Field label="No. of Openings" name="openings" type="number" />
              <Field label="Stage" name="stage" options={STAGES} />
              <Field label="Applicant Name" name="applicant_name" />
              <Field label="Applicant Email" name="applicant_email" type="email" />
              <Field label="Applicant Phone" name="applicant_phone" />
              <Field label="Expected Salary (₹/mo)" name="expected_salary" type="number" />
              <div className="sm:col-span-2"><Field label="Notes" name="notes" /></div>
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
    </div>
  );
}