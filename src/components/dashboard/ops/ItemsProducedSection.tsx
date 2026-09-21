import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getItemsSummary, type ItemsSummary } from "@/api/opsApi";
import { fyOf, fyLabel } from "@/components/dashboard/ops/fiscalYear";

// Product names are free text, hand-typed per row - real duplicates differ
// only in case/whitespace ("cup" vs "Cup"). Grouping key folds those
// together; the display label is a cleaned-up, title-cased version of it.
// Real typos (transposed letters, etc.) still end up as separate entries -
// there's no product catalog to match against.
function normalizeProductName(raw: string): { key: string; label: string } {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  return { key: cleaned.toLowerCase(), label: cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) };
}

export default function ItemsProducedSection() {
  const [data, setData] = useState<ItemsSummary | null>(null);
  const [error, setError] = useState("");
  const [selectedFy, setSelectedFy] = useState<string | null>(null);

  useEffect(() => {
    getItemsSummary()
      .then(setData)
      .catch((err: Error) => setError(err.message || "Failed to load item data"));
  }, []);

  const availableFys = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map((r) => fyOf(r.date)))].sort();
  }, [data]);
  const fy = selectedFy ?? availableFys.at(-1);

  const itemTotals = useMemo(() => {
    if (!data || !fy) return [];
    const totals = new Map<string, { label: string; qty: number }>();
    for (const r of data.items) {
      if (fyOf(r.date) !== fy) continue;
      const { key, label } = normalizeProductName(r.productName);
      const existing = totals.get(key);
      totals.set(key, { label: existing?.label ?? label, qty: (existing?.qty ?? 0) + r.qty });
    }
    return [...totals.values()].sort((a, b) => b.qty - a.qty);
  }, [data, fy]);

  const topItems = itemTotals.slice(0, 10);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading item data…
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <DashCard>
        <p className="text-sm text-muted-foreground">
          No production log data imported yet. Upload the daily production workbook from Data → Import.
        </p>
      </DashCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Items produced
        </p>
        <div className="flex gap-1.5">
          {availableFys.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedFy(y)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                y === fy
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {fyLabel(y)}
            </button>
          ))}
        </div>
      </div>

      <DashCard title="Top items by quantity">
        <ResponsiveContainer width="100%" height={Math.max(220, topItems.length * 32)}>
          <BarChart data={topItems} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
            <Tooltip />
            <Bar dataKey="qty" name="Quantity" fill="#10b981" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      <DashCard title="All items">
        <div className="max-h-[480px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Item</th>
                <th className="py-2 font-medium text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {itemTotals.map((item) => (
                <tr key={item.label} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 text-foreground">{item.label}</td>
                  <td className="py-2 text-right text-foreground">{item.qty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashCard>

      <DashCard title="What this view shows">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5">
              Available now
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Item/product quantities across throwing, finishing, glazing and firing</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1.5">
              Caveats
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Product names are free text - near-duplicates (case/spacing) are merged, but typos aren't</li>
              <li>A piece logged at multiple stages contributes to this total at each stage, same as the Production page's Total Pieces</li>
            </ul>
          </div>
        </div>
      </DashCard>
    </div>
  );
}
