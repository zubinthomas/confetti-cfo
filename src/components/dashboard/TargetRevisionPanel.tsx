import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FormField from "@/components/hr/FormField";
import { useAuth } from "@/lib/AuthContext";
import { listRevenueTargetRevisions, reviseRevenueTarget } from "@/api/revenueTargetsApi";
import { L } from "@/data/seriesKernel";
import type { RevenueTargetRevision } from "@/data/types";

// Version history + manual revision for one (period, category) target
// (Section 8's "versioned quarterly plans" - see revenue_target_revisions in
// schema.ts). Every automatic import-driven change already lands a row here;
// this is the one UI surface onto it, plus the one manual write path,
// gated by RevenueTarget:write.
export default function TargetRevisionPanel({
  periodId, category, label,
}: { periodId: number; category: "store" | "fnb"; label: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = can("RevenueTarget", "write");

  const [revisions, setRevisions] = useState<RevenueTargetRevision[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    listRevenueTargetRevisions(periodId, category)
      .then(setRevisions)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  const submit = async () => {
    const targetAmount = Number(amount);
    if (amount === "" || !Number.isFinite(targetAmount)) { setError("Enter a valid amount"); return; }
    setSaving(true);
    setError("");
    try {
      await reviseRevenueTarget(periodId, category, { targetAmount, note: note || undefined });
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["revenue-targets"] });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover onOpenChange={(open) => { if (open && !revisions && !loading) load(); }}>
      <PopoverTrigger asChild>
        <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground underline shrink-0">
          History
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <p className="text-xs font-medium text-popover-foreground mb-2">{label} - revision history</p>

        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        {!loading && revisions && revisions.length === 0 && (
          <p className="text-xs text-muted-foreground">No revisions yet.</p>
        )}
        {!loading && revisions && revisions.length > 0 && (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {revisions.map((r) => (
              <li key={r.id} className="text-xs border-b border-border last:border-0 pb-1.5">
                <div className="flex justify-between">
                  <span className="font-medium text-popover-foreground">₹{L(r.targetAmount)}</span>
                  <span className="text-muted-foreground">
                    {new Date(r.createdDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {r.createdByName || r.createdByEmail || "Import"}
                  {r.note && ` · ${r.note}`}
                </p>
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <p className="text-xs font-medium text-popover-foreground">Revise target</p>
            <FormField label="New Amount (₹)" name="targetAmount" type="number" value={amount} onChange={(_, v) => setAmount(v)} />
            <FormField label="Note (optional)" name="note" value={note} onChange={(_, v) => setNote(v)} />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="button" onClick={submit} disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save Revision
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
