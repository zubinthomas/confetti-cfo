import React, { useCallback, useEffect, useRef, useState } from "react";
import DashCard from "./DashCard";
import {
  uploadWorkbook, listBatches, commitBatch, discardBatch,
  type ImportBatch, type ImportIssue,
} from "@/api/importApi";
import { Upload, Loader2, AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";

const KIND_LABELS: Record<ImportBatch["kind"], string> = {
  cepl: "CEPL P&L",
  cafe: "Cafe Weekly P&L",
  sienna: "Sienna Store Sales",
};

const STATUS_STYLE: Record<ImportBatch["status"], string> = {
  preview: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  committed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  discarded: "bg-muted text-muted-foreground",
};

const ISSUE_ICON = {
  error: <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />,
  info: <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />,
};

function IssueList({ issues }: { issues: ImportIssue[] }) {
  const [showInfo, setShowInfo] = useState(false);
  const important = issues.filter((i) => i.level !== "info");
  const info = issues.filter((i) => i.level === "info");
  if (!issues.length) return <p className="text-xs text-muted-foreground">No validation findings — clean parse.</p>;
  return (
    <div className="space-y-1.5">
      {important.map((i, idx) => (
        <div key={idx} className="flex items-start gap-2 text-xs text-foreground">
          {ISSUE_ICON[i.level]}
          <span><span className="text-muted-foreground">[{i.sheet}]</span> {i.message}</span>
        </div>
      ))}
      {info.length > 0 && (
        <button className="text-xs text-muted-foreground underline" onClick={() => setShowInfo(!showInfo)}>
          {showInfo ? "Hide" : "Show"} {info.length} informational note{info.length > 1 ? "s" : ""}
        </button>
      )}
      {showInfo && info.map((i, idx) => (
        <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
          {ISSUE_ICON.info}
          <span>[{i.sheet}] {i.message}</span>
        </div>
      ))}
    </div>
  );
}

function StatsTable({ stats }: { stats: ImportBatch["stats"] }) {
  const rows = Object.entries(stats).filter(([, s]) => s.creates + s.updates + s.unchanged > 0);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground border-b border-border">
          <th className="py-1 pr-2 font-medium">Table</th>
          <th className="py-1 pr-2 font-medium text-right">New</th>
          <th className="py-1 pr-2 font-medium text-right">Changed</th>
          <th className="py-1 font-medium text-right">Unchanged</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([table, s]) => (
          <tr key={table} className="border-b border-border last:border-0">
            <td className="py-1 pr-2 text-foreground">{table}</td>
            <td className={`py-1 pr-2 text-right ${s.creates ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>{s.creates}</td>
            <td className={`py-1 pr-2 text-right ${s.updates ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>{s.updates}</td>
            <td className="py-1 text-right text-muted-foreground">{s.unchanged}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ImportPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [committed, setCommitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => { listBatches().then(setBatches).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const onFile = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      await uploadWorkbook(file);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onCommit = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      await commitBatch(id);
      setCommitted(true);
      // the dashboards' dataset is loaded once at startup — reload to pick up the import
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setBusyId(null);
    }
  };

  const onDiscard = async (id: number) => {
    setBusyId(id);
    try { await discardBatch(id); refresh(); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Data — Import Excel Workbooks
      </p>

      <DashCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer
            ${uploading ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Validating…" : "Upload workbook (.xlsx)"}
            <input
              ref={fileRef} type="file" accept=".xlsx" className="hidden" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Accepts the CEPL P&L, Cafe Weekly P&L and Sienna Store Sales workbooks. Uploads are
            validated and previewed first — nothing changes until you commit.
          </p>
        </div>
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        {committed && (
          <p className="flex items-center gap-2 text-sm text-emerald-600 mt-3">
            <CheckCircle2 className="w-4 h-4" /> Imported — reloading the dashboards…
          </p>
        )}
      </DashCard>

      {batches.map((b) => (
        <DashCard
          key={b.id}
          title={`#${b.id} · ${b.filename}`}
          action={
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status]}`}>
              {b.status}
            </span>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            {KIND_LABELS[b.kind]} · uploaded {new Date(b.uploadedAt).toLocaleString()}
            {b.committedAt && ` · committed ${new Date(b.committedAt).toLocaleString()}`}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">
                {b.status === "preview" ? "What committing will do" : "What this import did"}
              </p>
              <StatsTable stats={b.stats} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Validation findings</p>
              <IssueList issues={b.issues} />
            </div>
          </div>
          {b.status === "preview" && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onCommit(b.id)}
                disabled={busyId === b.id || b.issues.some((i) => i.level === "error")}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {busyId === b.id ? "Committing…" : "Commit import"}
              </button>
              <button
                onClick={() => onDiscard(b.id)}
                disabled={busyId === b.id}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Discard
              </button>
              {b.issues.some((i) => i.level === "error") && (
                <span className="text-xs text-red-500 self-center">Fix the errors above and re-upload to commit.</span>
              )}
            </div>
          )}
        </DashCard>
      ))}

      <p className="text-xs text-muted-foreground">
        Imports upsert by natural key (department + period + line item, and so on): re-importing the
        same workbook is a no-op, updated cells change exactly the affected values, and new
        months/rows are appended. Every batch is kept here as provenance.
      </p>
    </div>
  );
}
