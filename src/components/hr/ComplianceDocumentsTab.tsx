import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getComplianceDocuments } from "@/api/compliance";

const STATUS_STYLE: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function ComplianceDocumentsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["compliance", "documents"],
    queryFn: getComplianceDocuments,
    staleTime: 60_000,
  });
  const documents = data ?? [];

  return (
    <DashCard title="Company Documents" className="space-y-4">
      <p className="text-xs text-muted-foreground -mt-2">
        Statutory document register, imported from the Compliance Payment Tracker workbook.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No documents imported yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Document</th>
                <th className="text-left py-2 pr-3 font-medium">Type</th>
                <th className="text-left py-2 pr-3 font-medium">Issued</th>
                <th className="text-left py-2 pr-3 font-medium">Filed</th>
                <th className="text-left py-2 pr-3 font-medium">Expiry</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-foreground">{d.documentName}</p>
                    {d.documentNumber && <p className="text-xs text-muted-foreground font-mono">#{d.documentNumber}</p>}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{d.documentType ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-foreground">{d.issueDate ?? d.issueDateRaw ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-foreground">{d.filingDate ?? d.filingDateRaw ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-foreground">{d.expiryDate ?? d.expiryDateRaw ?? "-"}</td>
                  <td className="py-2.5">
                    {d.status ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[d.status] ?? "bg-muted text-muted-foreground"}`}>{d.status}</span>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
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
