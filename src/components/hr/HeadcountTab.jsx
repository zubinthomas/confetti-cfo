import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, X, Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";

const divisionColors = { Ceramics: "#3b82f6", Textiles: "#10b981", Siena: "#f59e0b", Admin: "#8b5cf6" };

const EMPTY = { full_name: "", employee_id: "", division: "Ceramics", role: "", employment_type: "Full-time", status: "Active", joining_date: "", monthly_salary: "", phone: "", email: "", aadhar_number: "", pan_number: "", blood_group: "", emergency_contact_name: "", emergency_contact_phone: "", address: "", notes: "" };

export default function HeadcountTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Employee.list();
    setEmployees(data);
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload = { ...form, monthly_salary: Number(form.monthly_salary) || 0 };
    if (form.id) await base44.entities.Employee.update(form.id, payload);
    else await base44.entities.Employee.create(payload);
    setSaving(false);
    setShowForm(false);
    setForm(EMPTY);
    load();
  };

  const remove = async (id) => {
    await base44.entities.Employee.delete(id);
    load();
  };

  const divStats = ["Ceramics", "Textiles", "Siena", "Admin"].map(d => ({
    name: d,
    count: employees.filter(e => e.division === d).length,
    payroll: employees.filter(e => e.division === d).reduce((s, e) => s + (e.monthly_salary || 0), 0),
  }));

  const totalPayroll = employees.reduce((s, e) => s + (e.monthly_salary || 0), 0);

  const Field = ({ label, name, type = "text", options = null }) => (
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

  const statusColor = { Active: "text-emerald-600", "On Leave": "text-amber-600", Terminated: "text-red-600", Probation: "text-blue-600" };

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

      <DashCard title="Employee Directory">
        <div className="flex justify-end mb-3">
          <button onClick={() => { setForm(EMPTY); setShowForm(true); }}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>

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
                        <button onClick={() => { setForm({ ...emp }); setShowForm(true); }} className="text-xs text-primary hover:underline">Edit</button>
                        <button onClick={() => remove(emp.id)} className="text-xs text-red-500 hover:underline">Delete</button>
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
              <Field label="Full Name *" name="full_name" />
              <Field label="Employee ID" name="employee_id" />
              <Field label="Division *" name="division" options={["Ceramics", "Textiles", "Siena", "Admin"]} />
              <Field label="Role / Designation *" name="role" />
              <Field label="Employment Type" name="employment_type" options={["Full-time", "Part-time", "Contract", "Intern"]} />
              <Field label="Status" name="status" options={["Active", "On Leave", "Terminated", "Probation"]} />
              <Field label="Joining Date" name="joining_date" type="date" />
              <Field label="Monthly Salary (₹)" name="monthly_salary" type="number" />
              <Field label="Phone" name="phone" />
              <Field label="Email" name="email" type="email" />
              <Field label="Aadhar Number" name="aadhar_number" />
              <Field label="PAN Number" name="pan_number" />
              <Field label="Blood Group" name="blood_group" />
              <Field label="Emergency Contact Name" name="emergency_contact_name" />
              <Field label="Emergency Contact Phone" name="emergency_contact_phone" />
              <div className="sm:col-span-2"><Field label="Address" name="address" /></div>
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

      {/* Employee Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">{selected.full_name}</h2>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              {[["Division", selected.division], ["Role", selected.role], ["Type", selected.employment_type], ["Status", selected.status], ["Joining Date", selected.joining_date], ["Salary/mo", selected.monthly_salary ? `₹${selected.monthly_salary.toLocaleString()}` : "—"], ["Phone", selected.phone], ["Email", selected.email], ["Aadhar", selected.aadhar_number], ["PAN", selected.pan_number], ["Blood Group", selected.blood_group], ["Emergency Contact", selected.emergency_contact_name ? `${selected.emergency_contact_name} — ${selected.emergency_contact_phone}` : "—"]].map(([k, v]) => v ? (
                <div key={k} className="flex justify-between border-b border-border pb-2 last:border-b-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium text-right">{v}</span>
                </div>
              ) : null)}
              {selected.address && <div className="border-b border-border pb-2"><span className="text-muted-foreground block mb-1">Address</span><span className="text-foreground">{selected.address}</span></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}