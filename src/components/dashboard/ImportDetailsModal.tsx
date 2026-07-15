import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { ImportBatchDetails, ImportRecordChange } from "@/api/importApi";

// Same table order StatsTable renders in, so the two views read consistently.
const TABLE_ORDER = [
  "businesses", "businessUnits", "periods", "lineItems",
  "categories", "channels", "vendors",
  "financialRecords", "salesRecords", "consignmentRecords",
];

const PAGE_SIZE = 50;

function formatValue(v: unknown, maximumFractionDigits: number): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits });
  return String(v);
}

/** Formats a from/to pair, escalating decimal precision only if needed to
 *  tell them apart - a merge can flag two floats as "changed" by less than
 *  a cent/percentage-point (parser rounding noise), and showing "0.1865 →
 *  0.1865" at low precision reads as a bug. */
function formatChangePair(from: unknown, to: unknown): [string, string] {
  const base = typeof to === "number" && Math.abs(to) < 10 ? 6 : 2;
  const a = formatValue(from, base);
  const b = formatValue(to, base);
  if (a !== b) return [a, b];
  // rounding made two genuinely different floats look identical - fall back
  // to their exact (unrounded) JS string form, which always round-trips
  if (typeof from === "number" && typeof to === "number") return [String(from), String(to)];
  return [a, b];
}

function ChangeRow({ change }: { change: ImportRecordChange }) {
  const isCreate = change.action === "create";
  return (
    <div className="text-xs py-1 border-b border-border last:border-0">
      <span className={isCreate ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
        {isCreate ? "+ " : "~ "}{change.description}
      </span>
      {change.fields?.map((f, i) => {
        const [from, to] = formatChangePair(isCreate ? null : f.from, f.to);
        return (
          <div key={i} className="text-muted-foreground pl-4">
            {f.field}: {isCreate ? to : `${from} → ${to}`}
          </div>
        );
      })}
    </div>
  );
}

function TableSection({ table, changes }: { table: string; changes: ImportRecordChange[] }) {
  const [expanded, setExpanded] = useState(false);
  const creates = changes.filter((c) => c.action === "create").length;
  const updates = changes.filter((c) => c.action === "update").length;
  const shown = expanded ? changes : changes.slice(0, PAGE_SIZE);
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-foreground mb-1.5">
        {table} <span className="text-muted-foreground font-normal">· {creates} created, {updates} updated</span>
      </p>
      <div className="rounded-lg border border-border px-2.5">
        {shown.map((c, i) => <ChangeRow key={i} change={c} />)}
      </div>
      {changes.length > PAGE_SIZE && (
        <button
          className="text-xs text-muted-foreground underline mt-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `Show all ${changes.length}`}
        </button>
      )}
    </div>
  );
}

export interface ImportDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchLabel: string;
  details: ImportBatchDetails | undefined;
  loading: boolean;
}

export default function ImportDetailsModal({
  open, onOpenChange, batchLabel, details, loading,
}: ImportDetailsModalProps) {
  const sections = details
    ? TABLE_ORDER.filter((t) => (details[t]?.length ?? 0) > 0)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Full change details · {batchLabel}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !details ? (
          <p className="text-xs text-muted-foreground">
            Full change details aren't available for this import.
          </p>
        ) : sections.length === 0 ? (
          <p className="text-xs text-muted-foreground">No changes were recorded for this import.</p>
        ) : (
          sections.map((table) => (
            <TableSection key={table} table={table} changes={details[table]} />
          ))
        )}
      </DialogContent>
    </Dialog>
  );
}
