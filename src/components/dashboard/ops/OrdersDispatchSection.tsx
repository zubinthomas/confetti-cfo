import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { getOrdersSummary, type OrdersSummary, type OrderLine } from "@/api/opsApi";

const PIPELINE = ["green", "drawing", "bisque", "glazeApp", "glazeFiring", "ready"] as const;
type Stage = typeof PIPELINE[number];
const STAGE_LABEL: Record<Stage, string> = {
  green: "Green", drawing: "Drawing", bisque: "Bisque",
  glazeApp: "Glaze App", glazeFiring: "Glaze Firing", ready: "Ready",
};

function stageQtys(o: OrderLine): Record<Stage, number | null> {
  return {
    green: o.greenQty, drawing: o.drawingQty, bisque: o.bisqueQty,
    glazeApp: o.glazeAppQty, glazeFiring: o.glazeFiringQty, ready: o.readyQty,
  };
}

/** Last non-null stage in pipeline order - a single-current-stage snapshot,
 *  not cumulative (confirmed with the source's maintainer). */
function currentStage(o: OrderLine): Stage | null {
  const qtys = stageQtys(o);
  let last: Stage | null = null;
  for (const stage of PIPELINE) if (qtys[stage] != null) last = stage;
  return last;
}

const isReady = (o: OrderLine) => currentStage(o) === "ready";
const isOverdue = (o: OrderLine, today: string) =>
  !isReady(o) && o.dispatchDate != null && o.dispatchDate < today;
const isDueSoon = (o: OrderLine, today: string, in7: string) =>
  !isReady(o) && o.dispatchDate != null && o.dispatchDate >= today && o.dispatchDate <= in7;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function OrdersDispatchSection() {
  const [data, setData] = useState<OrdersSummary | null>(null);
  const [error, setError] = useState("");
  const [client, setClient] = useState<string>("All");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    getOrdersSummary()
      .then(setData)
      .catch((err: Error) => setError(err.message || "Failed to load order data"));
  }, []);

  const today = useMemo(() => todayIso(), []);
  const in7 = useMemo(() => addDaysIso(today, 7), [today]);

  const clients = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.orders.map((o) => o.client))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.orders.filter((o) => client === "All" || o.client === client);
  }, [data, client]);

  const visible = useMemo(
    () => (showAll ? filtered : filtered.filter((o) => !isReady(o))),
    [filtered, showAll],
  );

  const kpis = useMemo(() => {
    const open = filtered.filter((o) => !isReady(o));
    const overdue = filtered.filter((o) => isOverdue(o, today));
    const readyQty = filtered.filter(isReady).reduce((sum, o) => sum + (o.readyQty ?? 0), 0);
    return { open: open.length, overdue: overdue.length, readyQty };
  }, [filtered, today]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading order data…
      </div>
    );
  }

  if (data.orders.length === 0) {
    return (
      <DashCard>
        <p className="text-sm text-muted-foreground">
          No order-status data imported yet. Upload a client Order Status workbook from Data → Import.
        </p>
      </DashCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Client orders
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {["All", ...clients].map((c) => (
            <button
              key={c}
              onClick={() => setClient(c)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                c === client
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Open Orders" value={kpis.open} sub="Not yet ready for dispatch" />
        <KpiCard
          label="Overdue" value={kpis.overdue}
          status={kpis.overdue > 0 ? "red" : "green"}
          sub={kpis.overdue > 0 ? "Past their dispatch date" : "None overdue"}
        />
        <KpiCard label="Ready to Dispatch" value={kpis.readyQty.toLocaleString()} sub="Total ready quantity" />
      </div>

      <DashCard
        title="Order lines"
        action={
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {showAll ? "Hide ready orders" : "Show ready orders"}
          </button>
        }
      >
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No order lines match this filter.</p>
        ) : (
          <div className="max-h-[560px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 font-medium">Item</th>
                  <th className="py-2 pr-4 font-medium">Size / Colour</th>
                  <th className="py-2 pr-4 font-medium text-right">Order Qty</th>
                  <th className="py-2 pr-4 font-medium">Current Stage</th>
                  <th className="py-2 pr-4 font-medium">Dispatch Date</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const stage = currentStage(o);
                  const stageIdx = stage ? PIPELINE.indexOf(stage) : -1;
                  const overdue = isOverdue(o, today);
                  const dueSoon = isDueSoon(o, today, in7);
                  const ready = isReady(o);
                  return (
                    <tr key={o.id} className="border-b border-border last:border-b-0 align-top">
                      <td className="py-2 pr-4 text-foreground whitespace-nowrap">{o.client}</td>
                      <td className="py-2 pr-4 text-foreground">{o.itemName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {[o.size, o.colour].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-2 pr-4 text-right text-foreground">{o.orderQty ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-0.5">
                            {PIPELINE.map((s, i) => (
                              <span
                                key={s}
                                title={STAGE_LABEL[s]}
                                className={`w-2 h-2 rounded-full ${
                                  i <= stageIdx ? "bg-primary" : "bg-muted"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {stage ? STAGE_LABEL[stage] : "Not started"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {o.dispatchDate ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {ready ? (
                          <StatusBadge status="green">Ready</StatusBadge>
                        ) : overdue ? (
                          <StatusBadge status="red">Overdue</StatusBadge>
                        ) : dueSoon ? (
                          <StatusBadge status="amber">Due soon</StatusBadge>
                        ) : (
                          <StatusBadge status="green">On track</StatusBadge>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground">{o.remarks ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      <DashCard title="What this view shows">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5">
              Available now
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Order quantity, current production stage, and dispatch status across all four client relationships</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1.5">
              Caveats
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Rows are matched across re-uploads by client + item name + size + colour, not row position - two truly identical rows in one client's sheet would collide</li>
              <li>Drawing stage only applies to Sienna x Dubai; blank for the other three clients</li>
              <li>Dispatch Date is the sheet's planned/target date, not a confirmed actual-dispatch date - "Overdue" means the target date has passed and the item hasn't reached Ready yet</li>
              <li>Photo, Price and MOQ columns are not imported in this version</li>
            </ul>
          </div>
        </div>
      </DashCard>
    </div>
  );
}
