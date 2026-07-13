import React, { useState, useEffect } from "react";
import { Licence } from "@/api/entities";
import { uploadFile } from "@/api/integrations";
import { Plus, X, Loader2, Upload, FileText, AlertTriangle, Clock, XCircle, ShieldCheck } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import FormField from "./FormField";

// Days until expiry
const daysUntil = (dateStr: string | null | undefined) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const statusStyle: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Renewal Pending": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Applied: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Not Applied": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Not Applicable": "bg-muted text-muted-foreground",
};

const LOCATIONS = [
  "Kolkata (Head Office)",
  "Kolkata (Siena)",
  "Birbhum (Ceramics Factory)",
  "Birbhum (Other)",
  "All Locations",
];

const DIVISIONS = ["Ceramics", "Textiles", "Siena", "Admin", "All"];

const LICENCE_TYPES = [
  "Trade Licence", "GST Registration", "FSSAI", "Excise / Bar Licence",
  "Fire NOC", "Building Plan Approval", "Factory Licence", "Shops & Establishments",
  "ESI Registration", "PF Registration", "Professional Tax", "Pollution Control NOC",
  "Signage Permission", "Labour Licence", "Import Export Code", "MSME / Udyam",
  "Pollution Control Consent", "Water / Sewage Permit", "KMC Permission",
  "Panchayat / Municipality NOC", "Other",
];

const EMPTY = {
  licence_name: "", licence_type: "Trade Licence", authority: "",
  location: "Kolkata (Head Office)", division: "Admin",
  licence_number: "", issue_date: "", expiry_date: "",
  status: "Active", renewal_reminder_days: 30,
  annual_fee: "", notes: "",
};

// Pre-populated checklist of commonly required licences for Confetti Exports
const CHECKLIST = [
  { licence_name: "Trade Licence — Kolkata HO", licence_type: "Trade Licence", authority: "KMC (Kolkata Municipal Corporation)", location: "Kolkata (Head Office)", division: "Admin" },
  { licence_name: "Trade Licence — Siena Restaurant & Bar", licence_type: "Trade Licence", authority: "KMC (Kolkata Municipal Corporation)", location: "Kolkata (Siena)", division: "Siena" },
  { licence_name: "Trade Licence — Birbhum Factory", licence_type: "Trade Licence", authority: "Birbhum Zila Parishad / Municipality", location: "Birbhum (Ceramics Factory)", division: "Ceramics" },
  { licence_name: "GST Registration (Group)", licence_type: "GST Registration", authority: "GSTN / GST Department", location: "All Locations", division: "All" },
  { licence_name: "FSSAI — Siena Food Business", licence_type: "FSSAI", authority: "FSSAI (Food Safety & Standards Authority)", location: "Kolkata (Siena)", division: "Siena" },
  { licence_name: "Excise / Bar Licence — Siena", licence_type: "Excise / Bar Licence", authority: "West Bengal Excise Dept.", location: "Kolkata (Siena)", division: "Siena" },
  { licence_name: "Fire NOC — Siena", licence_type: "Fire NOC", authority: "West Bengal Fire & Emergency Services", location: "Kolkata (Siena)", division: "Siena" },
  { licence_name: "Fire NOC — Birbhum Factory", licence_type: "Fire NOC", authority: "West Bengal Fire & Emergency Services", location: "Birbhum (Ceramics Factory)", division: "Ceramics" },
  { licence_name: "Factory Licence — Ceramics", licence_type: "Factory Licence", authority: "WB Directorate of Factories", location: "Birbhum (Ceramics Factory)", division: "Ceramics" },
  { licence_name: "Shops & Establishments — Kolkata HO", licence_type: "Shops & Establishments", authority: "WB Labour Dept.", location: "Kolkata (Head Office)", division: "Admin" },
  { licence_name: "Shops & Establishments — Siena", licence_type: "Shops & Establishments", authority: "WB Labour Dept.", location: "Kolkata (Siena)", division: "Siena" },
  { licence_name: "ESI Registration", licence_type: "ESI Registration", authority: "ESIC", location: "All Locations", division: "All" },
  { licence_name: "PF / EPF Registration", licence_type: "PF Registration", authority: "EPFO", location: "All Locations", division: "All" },
  { licence_name: "Professional Tax — WB", licence_type: "Professional Tax", authority: "WB PT Department", location: "All Locations", division: "All" },
  { licence_name: "Pollution Control NOC — Ceramics Factory", licence_type: "Pollution Control NOC", authority: "WBPCB", location: "Birbhum (Ceramics Factory)", division: "Ceramics" },
  { licence_name: "Pollution Control Consent (CTE/CTO)", licence_type: "Pollution Control Consent", authority: "WBPCB", location: "Birbhum (Ceramics Factory)", division: "Ceramics" },
  { licence_name: "Labour Licence — Ceramics Factory", licence_type: "Labour Licence", authority: "WB Labour Dept.", location: "Birbhum (Ceramics Factory)", division: "Ceramics" },
  { licence_name: "Import Export Code (IEC)", licence_type: "Import Export Code", authority: "DGFT", location: "Kolkata (Head Office)", division: "Admin" },
  { licence_name: "MSME / Udyam Registration", licence_type: "MSME / Udyam", authority: "MSME Ministry", location: "All Locations", division: "All" },
  { licence_name: "KMC Building Permission — Siena", licence_type: "KMC Permission", authority: "KMC Building Dept.", location: "Kolkata (Siena)", division: "Siena" },
  { licence_name: "Signage Permission — Siena", licence_type: "Signage Permission", authority: "KMC Advertisement Dept.", location: "Kolkata (Siena)", division: "Siena" },
  { licence_name: "Water / Sewage NOC — Birbhum", licence_type: "Water / Sewage Permit", authority: "PHED / Local Municipality", location: "Birbhum (Ceramics Factory)", division: "Ceramics" },
];

export default function ComplianceTab() {
  const [licences, setLicences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterLoc, setFilterLoc] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [seeding, setSeeding] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await Licence.list("-created_date");
    setLicences(data);
    setLoading(false);
  };

  const seedChecklist = async () => {
    setSeeding(true);
    for (const item of CHECKLIST) {
      await Licence.create({ ...item, status: "Not Applied", renewal_reminder_days: 30 });
    }
    setSeeding(false);
    load();
  };

  const save = async () => {
    setSaving(true);
    const payload = { ...form, annual_fee: Number(form.annual_fee) || 0, renewal_reminder_days: Number(form.renewal_reminder_days) || 30 };
    if (form.id) await Licence.update(form.id, payload);
    else await Licence.create(payload);
    setSaving(false);
    setShowForm(false);
    setForm(EMPTY);
    load();
  };

  const remove = async (id: string) => { await Licence.delete(id); load(); };

  const uploadDoc = async (id: string, file: File) => {
    setUploading(true);
    const { file_url } = await uploadFile(file);
    await Licence.update(id, { document_url: file_url });
    setUploading(false);
    load();
  };

  const updateField = (name: string, value: string) => setForm(f => ({ ...f, [name]: value }));

  const filtered = licences.filter(l => {
    if (filterLoc !== "All" && l.location !== filterLoc) return false;
    if (filterStatus !== "All" && l.status !== filterStatus) return false;
    return true;
  });

  // Summary stats
  const expiringSoon = licences.filter(l => {
    const d = daysUntil(l.expiry_date);
    return d !== null && d >= 0 && d <= 60 && l.status === "Active";
  });
  const expired = licences.filter(l => l.status === "Expired").length;
  const active = licences.filter(l => l.status === "Active").length;
  const renewal = licences.filter(l => l.status === "Renewal Pending").length;

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashCard>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{active}</p>
        </DashCard>
        <DashCard>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-xs text-muted-foreground">Expiring in 60d</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">{expiringSoon.length}</p>
        </DashCard>
        <DashCard>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-muted-foreground">Renewal Pending</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">{renewal}</p>
        </DashCard>
        <DashCard>
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-500" />
            <p className="text-xs text-muted-foreground">Expired</p>
          </div>
          <p className="text-2xl font-bold text-red-600">{expired}</p>
        </DashCard>
      </div>

      {/* Expiring soon alert */}
      {expiringSoon.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Licences expiring within 60 days</p>
          </div>
          <div className="space-y-1">
            {expiringSoon.map(l => (
              <p key={l.id} className="text-xs text-amber-700 dark:text-amber-400">
                • <strong>{l.licence_name}</strong> — {l.location} — expires {l.expiry_date} ({daysUntil(l.expiry_date)} days)
              </p>
            ))}
          </div>
        </div>
      )}

      <DashCard title="Licence & Compliance Register">
        <div className="flex flex-wrap items-center gap-2 mb-4 justify-between">
          <div className="flex flex-wrap gap-2">
            {/* Location filter */}
            {["All", ...LOCATIONS].map(loc => (
              <button key={loc} onClick={() => setFilterLoc(loc)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition ${filterLoc === loc ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                {loc === "All" ? "All Locations" : loc}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {["All", "Not Applied", "Applied", "Active", "Renewal Pending", "Expired"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition ${filterStatus === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {licences.length === 0 && (
            <button onClick={seedChecklist} disabled={seeding}
              className="flex items-center gap-2 text-sm border border-dashed border-primary text-primary px-4 py-2 rounded-lg hover:bg-primary/5 transition disabled:opacity-50">
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Load Confetti Exports Compliance Checklist
            </button>
          )}
          <button onClick={() => { setForm(EMPTY); setShowForm(true); }}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
            <Plus className="w-4 h-4" /> Add Licence
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No licences found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Licence</th>
                  <th className="text-left py-2 pr-3 font-medium">Authority</th>
                  <th className="text-left py-2 pr-3 font-medium">Location</th>
                  <th className="text-left py-2 pr-3 font-medium">Expiry</th>
                  <th className="text-left py-2 pr-3 font-medium">Status</th>
                  <th className="text-left py-2 pr-3 font-medium">Doc</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const days = daysUntil(l.expiry_date);
                  const expiryWarning = days !== null && days <= 60 && days >= 0 && l.status === "Active";
                  return (
                    <tr key={l.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-foreground">{l.licence_name}</p>
                        <p className="text-xs text-muted-foreground">{l.licence_type}</p>
                        {l.licence_number && <p className="text-xs text-muted-foreground font-mono">#{l.licence_number}</p>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{l.authority || "—"}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{l.location}</td>
                      <td className="py-2.5 pr-3">
                        {l.expiry_date ? (
                          <div>
                            <p className={`text-xs font-medium ${expiryWarning ? "text-amber-600" : "text-foreground"}`}>{l.expiry_date}</p>
                            {days !== null && <p className={`text-xs ${days < 0 ? "text-red-500" : expiryWarning ? "text-amber-500" : "text-muted-foreground"}`}>
                              {days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`}
                            </p>}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[l.status] || ""}`}>{l.status}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1">
                          {l.document_url ? (
                            <a href={l.document_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-0.5">
                              <FileText className="w-3.5 h-3.5" /> View
                            </a>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                          <label className="cursor-pointer ml-1">
                            <input type="file" className="hidden" onChange={e => e.target.files[0] && uploadDoc(l.id, e.target.files[0])} />
                            <Upload className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
                          </label>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => { setForm({ ...l }); setShowForm(true); }} className="text-xs text-primary hover:underline">Edit</button>
                          <button onClick={() => remove(l.id)} className="text-xs text-red-500 hover:underline">Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
              <h2 className="text-base font-semibold text-foreground">{form.id ? "Edit Licence" : "Add Licence"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Licence Name *" name="licence_name" value={form.licence_name ?? ""} onChange={updateField} />
              <FormField label="Type *" name="licence_type" options={LICENCE_TYPES} value={form.licence_type ?? ""} onChange={updateField} />
              <FormField label="Issuing Authority" name="authority" value={form.authority ?? ""} onChange={updateField} />
              <FormField label="Licence / Certificate Number" name="licence_number" value={form.licence_number ?? ""} onChange={updateField} />
              <FormField label="Location *" name="location" options={LOCATIONS} value={form.location ?? ""} onChange={updateField} />
              <FormField label="Division *" name="division" options={DIVISIONS} value={form.division ?? ""} onChange={updateField} />
              <FormField label="Status" name="status" options={["Not Applied", "Applied", "Active", "Renewal Pending", "Expired", "Not Applicable"]} value={form.status ?? ""} onChange={updateField} />
              <FormField label="Issue Date" name="issue_date" type="date" value={form.issue_date ?? ""} onChange={updateField} />
              <FormField label="Expiry Date" name="expiry_date" type="date" value={form.expiry_date ?? ""} onChange={updateField} />
              <FormField label="Remind Before (days)" name="renewal_reminder_days" type="number" value={form.renewal_reminder_days ?? ""} onChange={updateField} />
              <FormField label="Annual Fee (₹)" name="annual_fee" type="number" value={form.annual_fee ?? ""} onChange={updateField} />
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
    </div>
  );
}