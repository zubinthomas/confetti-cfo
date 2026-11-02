import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getComplianceTrademarks } from "@/api/compliance";

export default function ComplianceTrademarksTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["compliance", "trademarks"],
    queryFn: getComplianceTrademarks,
    staleTime: 60_000,
  });
  const trademarks = data ?? [];

  return (
    <DashCard title="Trademarks" className="space-y-4">
      <p className="text-xs text-muted-foreground -mt-2">
        Trademark application/filing-status pipeline, imported from the Compliance Payment Tracker workbook.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : trademarks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No trademark applications imported yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Mark</th>
                <th className="text-left py-2 pr-3 font-medium">Application No.</th>
                <th className="text-left py-2 pr-3 font-medium">Class</th>
                <th className="text-left py-2 pr-3 font-medium">Filed</th>
                <th className="text-left py-2 pr-3 font-medium">Type</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {trademarks.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="py-2.5 pr-3 font-medium text-foreground">{t.markName ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground font-mono">{t.applicationNo}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{t.niceClass ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-foreground">{t.dateOfApplication ?? t.dateOfApplicationRaw ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{t.tmType ?? "-"}</td>
                  <td className="py-2.5 text-xs text-foreground">{t.status ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
