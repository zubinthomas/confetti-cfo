import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { reconcilePeriod } from "@/api/periodsApi";
import type { Period } from "@/data/types";
import type { ReferenceData } from "@/hooks/useReferenceData";

// Provisional/Reconciled badge for a single period (Section 8 of the
// implementation-guidelines gap analysis: monthly close should read
// "provisional" until someone marks it reconciled, not silently final).
// Period-level, not per-figure - see schema.ts's periods.reconciledAt comment
// for why. showAction also renders the mark/unmark control, gated by
// Period:write; without it (e.g. the Leadership Command Centre) the badge is
// read-only.
export default function ReconciledBadge({
  period,
  showAction = false,
}: {
  period: Period | null | undefined;
  showAction?: boolean;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!period) return null;
  const reconciled = period.reconciledAt != null;
  const canWrite = showAction && can("Period", "write");

  const toggle = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await reconcilePeriod(period.id, !reconciled);
      queryClient.setQueryData<ReferenceData>(["reference"], (old) =>
        old ? { ...old, periods: old.periods.map((p) => (p.id === updated.id ? updated : p)) } : old
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-[11px] px-2 py-0.5 rounded-full ${
          reconciled
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        }`}
        title={
          reconciled
            ? `Reconciled ${new Date(period.reconciledAt!).toLocaleString()}`
            : "Not yet marked reconciled - figures may still be amended"
        }
      >
        {reconciled ? "Reconciled" : "Provisional"}
      </span>
      {canWrite && (
        <button
          onClick={toggle}
          disabled={saving}
          className="text-[11px] text-muted-foreground hover:text-foreground underline disabled:opacity-50"
        >
          {saving ? "Saving…" : reconciled ? "Reopen" : "Mark reconciled"}
        </button>
      )}
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </div>
  );
}
