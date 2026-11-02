import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getCompliancePayments } from "@/api/compliance";

const CATEGORY_LABELS: Record<string, string> = { licence_tax: "Licences & Taxes", insurance: "Insurance" };

const STATUS_STYLE: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export default function CompliancePaymentsTab() {
  const [category, setCategory] = useState<"All" | "licence_tax" | "insurance">("All");
  const [location, setLocation] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["compliance", "payments"],
    queryFn: () => getCompliancePayments(),
    staleTime: 60_000,
  });

  const payments = data ?? [];
  const locations = ["All", ...Array.from(new Set(payments.map((p) => p.location))).sort()];
  const filtered = payments.filter((p) => {
    if (category !== "All" && p.category !== category) return false;
    if (location !== "All" && p.location !== location) return false;
    return true;
  });

  return (
    <DashCard title="Compliance Payments" className="space-y-4">
      <p className="text-xs text-muted-foreground -mt-2">
        Imported from the client's Compliance Payment Tracker workbook (Data Import). Correcting a row
        happens by re-uploading an updated workbook, not here.
      </p>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {(["All", "licence_tax", "insurance"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition ${category === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
            >
              {c === "All" ? "All Categories" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => (
            <button
              key={loc}
              onClick={() => setLocation(loc)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition ${location === loc ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No payments found for the selected filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Item</th>
                <th className="text-left py-2 pr-3 font-medium">Location</th>
                <th className="text-left py-2 pr-3 font-medium">Due</th>
                <th className="text-left py-2 pr-3 font-medium">Amount</th>
                <th className="text-left py-2 pr-3 font-medium">Status</th>
                <th className="text-left py-2 font-medium">Paid on / next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-foreground">{p.itemName}</p>
                    {p.detail && <p className="text-xs text-muted-foreground">{p.detail}</p>}
                    {p.policyNumber && <p className="text-xs text-muted-foreground font-mono">#{p.policyNumber}</p>}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{p.location}</td>
                  <td className="py-2.5 pr-3 text-xs text-foreground">{p.dueDate ?? p.dueDateRaw ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-foreground">{p.amount != null ? `₹${p.amount.toLocaleString()}` : "-"}</td>
                  <td className="py-2.5 pr-3">
                    {p.paymentStatus ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[p.paymentStatus] ?? "bg-muted text-muted-foreground"}`}>{p.paymentStatus}</span>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">
                    {p.paidOn ? `Paid ${p.paidOn}` : (p.scheduledFollowUp ?? p.scheduledFollowUpRaw) ? `Next: ${p.scheduledFollowUp ?? p.scheduledFollowUpRaw}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
