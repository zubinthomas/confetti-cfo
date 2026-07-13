import React, { useState, useEffect } from "react";
import { LeaveRequest } from "@/api/entities";
import { Plus, X, Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import FormField from "./FormField";

const EMPTY = { employee_name: "", division: "Ceramics", leave_type: "Sick", from_date: "", to_date: "", days: "", reason: "", status: "Pending" };

const statusMap: Record<string, "green" | "amber" | "red"> = { Approved: "green", Pending: "amber", Rejected: "red" };

export default function LeaveTab() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await LeaveRequest.list("-created_date");
    setLeaves(data);
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload = { ...form, days: Number(form.days) || 0 };
    if (form.id) await LeaveRequest.update(form.id, payload);
    else await LeaveRequest.create(payload);
    setSaving(false);
    setShowForm(false);
    setForm(EMPTY);
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    await LeaveRequest.update(id, { status });
    load();
  };

  const remove = async (id: string) => {
    await LeaveRequest.delete(id);
    load();
  };

  const updateField = (name: string, value: string) => setForm(f => ({ ...f, [name]: value }));

  const pending = leaves.filter(l => l.status === "Pending").length;
  const approved = leaves.filter(l => l.status === "Approved").length;
  const totalDays = leaves.filter(l => l.status === "Approved").reduce((s, l) => s + (l.days || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Requests" value={leaves.length} />
        <KpiCard label="Pending Approval" value={pending} status={pending > 0 ? "amber" : "green"} />
        <KpiCard label="Approved Leaves" value={approved} status="green" />
        <KpiCard label="Total Days Approved" value={totalDays} sub="This month" />
      </div>

      <DashCard title="Leave Requests">
        <div className="flex justify-end mb-3">
          <button onClick={() => { setForm(EMPTY); setShowForm(true); }}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
            <Plus className="w-4 h-4" /> New Request
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No leave requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Employee</th>
                  <th className="text-left py-2 pr-4 font-medium">Division</th>
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-left py-2 pr-4 font-medium">Dates</th>
                  <th className="text-left py-2 pr-4 font-medium">Days</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => (
                  <tr key={l.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-foreground">{l.employee_name}</p>
                      {l.reason && <p className="text-xs text-muted-foreground truncate max-w-[140px]">{l.reason}</p>}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{l.division}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{l.leave_type}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground text-xs">{l.from_date} → {l.to_date}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{l.days || "—"}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={statusMap[l.status]}>{l.status}</StatusBadge></td>
                    <td className="py-2.5">
                      <div className="flex gap-2 flex-wrap">
                        {l.status === "Pending" && <>
                          <button onClick={() => updateStatus(l.id, "Approved")} className="text-xs text-emerald-600 hover:underline">Approve</button>
                          <button onClick={() => updateStatus(l.id, "Rejected")} className="text-xs text-red-500 hover:underline">Reject</button>
                        </>}
                        <button onClick={() => { setForm({ ...l }); setShowForm(true); }} className="text-xs text-primary hover:underline">Edit</button>
                        <button onClick={() => remove(l.id)} className="text-xs text-red-500 hover:underline">Del</button>
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
              <h2 className="text-base font-semibold text-foreground">{form.id ? "Edit Leave Request" : "New Leave Request"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Employee Name *" name="employee_name" value={form.employee_name ?? ""} onChange={updateField} />
              <FormField label="Division" name="division" options={["Ceramics", "Textiles", "Siena", "Admin"]} value={form.division ?? ""} onChange={updateField} />
              <FormField label="Leave Type" name="leave_type" options={["Sick", "Casual", "Earned", "Unpaid", "Maternity/Paternity"]} value={form.leave_type ?? ""} onChange={updateField} />
              <FormField label="Status" name="status" options={["Pending", "Approved", "Rejected"]} value={form.status ?? ""} onChange={updateField} />
              <FormField label="From Date" name="from_date" type="date" value={form.from_date ?? ""} onChange={updateField} />
              <FormField label="To Date" name="to_date" type="date" value={form.to_date ?? ""} onChange={updateField} />
              <FormField label="Number of Days" name="days" type="number" value={form.days ?? ""} onChange={updateField} />
              <div className="sm:col-span-2"><FormField label="Reason" name="reason" value={form.reason ?? ""} onChange={updateField} /></div>
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