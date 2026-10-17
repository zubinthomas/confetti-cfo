import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashCard from "./DashCard";
import PageSpinner from "./PageSpinner";
import { useAuth } from "@/lib/AuthContext";
import {
  getCostCentres, assignToCostCentre, excludeFromCostCentres, returnToUndecided,
  type CostCentreOverview, type CostCentreTarget, type CostCentreView,
} from "@/api/costCentresApi";

const KIND_LABEL: Record<CostCentreTarget["kind"], string> = {
  businessUnit: "Unit", channel: "Channel", vendor: "Vendor",
};

const EXCLUDE = "exclude";
const selectClass = "text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground";

function KindTag({ kind }: { kind: CostCentreTarget["kind"] }) {
  return (
    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
      {KIND_LABEL[kind]}
    </span>
  );
}

// Assign (or move) a target to a centre, or exclude it with a reason. Used for
// both Unassigned rows and the "Move" control on a member row.
function AssignControl({
  target, centres, currentCentreId, onDone, onError, label,
}: {
  target: CostCentreTarget;
  centres: CostCentreView[];
  currentCentreId?: number;
  onDone: () => void;
  onError: (message: string) => void;
  label: string;
}) {
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    onError("");
    try {
      await fn();
      setChoice("");
      setReason("");
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onChoose = (value: string) => {
    setChoice(value);
    if (value && value !== EXCLUDE) run(() => assignToCostCentre(target, Number(value)));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        aria-label={`${label}: ${target.name}`}
        value={choice} disabled={busy} onChange={(e) => onChoose(e.target.value)} className={selectClass}
      >
        <option value="">{label}</option>
        {centres.filter((c) => c.isActive && c.id !== currentCentreId).map((c) => (
          <option key={c.id} value={c.id}>{c.code} {c.name}</option>
        ))}
        <option value={EXCLUDE}>Exclude (needs a reason)</option>
      </select>
      {choice === EXCLUDE && (
        <>
          <input
            type="text" value={reason} placeholder="Why is this excluded?" aria-label={`Exclusion reason for ${target.name}`}
            onChange={(e) => setReason(e.target.value)} className={`${selectClass} w-56`}
          />
          <button
            type="button" disabled={busy || !reason.trim()}
            onClick={() => run(() => excludeFromCostCentres(target, reason.trim()))}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Exclude
          </button>
        </>
      )}
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

// Cost-centre master (section 3 of the implementation guidelines): which
// reporting group each business unit, retail channel and consignment vendor
// rolls up into. Nothing else in the dashboard reads this yet, so changes
// here don't move any existing number.
export default function CostCentresPanel() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = can("CostCentre", "write");
  const [error, setError] = useState("");

  const { data, isLoading, isError, error: loadError } = useQuery<CostCentreOverview>({
    queryKey: ["cost-centres"],
    queryFn: getCostCentres,
    retry: false,
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) {
    return <p className="text-sm text-destructive">{loadError instanceof Error ? loadError.message : "Could not load cost centres."}</p>;
  }

  // The mapping also rides along in the cached reference data, which never
  // refetches on its own (staleTime: Infinity).
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cost-centres"] });
    queryClient.invalidateQueries({ queryKey: ["reference"] });
  };

  const unclear = async (memberId: number) => {
    setError("");
    try {
      await returnToUndecided(memberId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Each unit, retail channel and consignment vendor is in one of three states: a member of a cost centre,
        deliberately excluded (rollup rows and technical buckets), or undecided. New venues are never placed
        automatically; they show up under Undecided until someone chooses. This mapping is a draft until the
        proposal is signed off, and no existing report uses it yet.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {data.centres.map((c) => (
          <DashCard
            key={c.id}
            title={<span><span className="font-mono text-xs bg-primary text-primary-foreground rounded px-1.5 py-0.5 mr-2">{c.code}</span>{c.name}</span>}
          >
            {c.description && <p className="text-xs text-muted-foreground mb-3">{c.description}</p>}
            {c.members.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Not available: no members yet.</p>
            ) : (
              <ul className="space-y-2">
                {c.members.map((m) => (
                  <li key={m.memberId} className="flex items-center justify-between gap-2 flex-wrap text-sm">
                    <span className="flex items-center gap-2 min-w-0"><KindTag kind={m.kind} /><span className="truncate">{m.name}</span></span>
                    {canWrite && (
                      <span className="flex items-center gap-2">
                        <AssignControl
                          target={m} centres={data.centres} currentCentreId={c.id} label="Move to..."
                          onDone={refresh} onError={setError}
                        />
                        <button type="button" onClick={() => unclear(m.memberId)} className="text-xs text-muted-foreground hover:text-destructive">
                          Make undecided
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        ))}
      </div>

      <DashCard title={`Undecided (${data.unassigned.length})`}>
        {data.unassigned.length === 0 ? (
          <p className="text-xs text-muted-foreground">Everything has been placed or excluded.</p>
        ) : (
          <ul className="space-y-2">
            {data.unassigned.map((t) => (
              <li key={`${t.kind}:${t.targetId}`} className="flex items-center justify-between gap-2 flex-wrap text-sm">
                <span className="flex items-center gap-2 min-w-0"><KindTag kind={t.kind} /><span className="truncate">{t.name}</span></span>
                {canWrite && (
                  <AssignControl target={t} centres={data.centres} label="Decide..." onDone={refresh} onError={setError} />
                )}
              </li>
            ))}
          </ul>
        )}
      </DashCard>

      <DashCard title={`Excluded (${data.excluded.length})`}>
        {data.excluded.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing is excluded.</p>
        ) : (
          <ul className="space-y-2">
            {data.excluded.map((e) => (
              <li key={e.memberId} className="flex items-start justify-between gap-2 flex-wrap text-sm">
                <span className="min-w-0">
                  <span className="flex items-center gap-2"><KindTag kind={e.kind} /><span>{e.name}</span></span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{e.reason}</span>
                </span>
                {canWrite && (
                  <button type="button" onClick={() => unclear(e.memberId)} className="text-xs text-muted-foreground hover:text-destructive shrink-0">
                    Make undecided
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  );
}
