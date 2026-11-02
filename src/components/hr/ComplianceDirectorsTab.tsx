import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getComplianceDirectors } from "@/api/compliance";

export default function ComplianceDirectorsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["compliance", "directors"],
    queryFn: getComplianceDirectors,
    staleTime: 60_000,
  });
  const directors = data ?? [];

  return (
    <DashCard title="Director KYC" className="space-y-4">
      <p className="text-xs text-muted-foreground -mt-2">
        Aadhaar/PAN and appointment details - visible only to roles granted the Director KYC permission.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : directors.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No directors imported yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Name</th>
                <th className="text-left py-2 pr-3 font-medium">DIN</th>
                <th className="text-left py-2 pr-3 font-medium">Designation</th>
                <th className="text-left py-2 pr-3 font-medium">Appointed</th>
                <th className="text-left py-2 pr-3 font-medium">Aadhaar</th>
                <th className="text-left py-2 pr-3 font-medium">PAN</th>
                <th className="text-left py-2 font-medium">Contact</th>
              </tr>
            </thead>
            <tbody>
              {directors.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="py-2.5 pr-3 font-medium text-foreground">{d.name ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground font-mono">{d.din}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{d.designation ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-foreground">{d.dateOfAppointment ?? d.dateOfAppointmentRaw ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground font-mono">{d.aadhaarNumber ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground font-mono">{d.panNumber ?? "-"}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">
                    {d.email && <div>{d.email}</div>}
                    {d.contactNumber && <div>{d.contactNumber}</div>}
                    {!d.email && !d.contactNumber && "-"}
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
