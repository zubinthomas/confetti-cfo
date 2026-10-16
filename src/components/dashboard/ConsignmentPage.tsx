import React, { useState } from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import ChartTooltip from "./ChartTooltip";
import PageSpinner from "./PageSpinner";
import TrackerImportBadge from "./TrackerImportBadge";
import { useConsignmentData } from "@/hooks/useConsignmentData";
import { useImportFreshness } from "@/hooks/useImportFreshness";
import { L } from "@/data/seriesKernel";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function ConsignmentPage() {
  const CONSIGNMENT = useConsignmentData();
  const [fyIdx, setFyIdx] = useState<number | null>(null);
  const freshness = useImportFreshness(["sienna"]);
  if (!CONSIGNMENT) return <PageSpinner />;
  const activeIdx = fyIdx ?? CONSIGNMENT.length - 2; // default: current FY 25-26
  const year = CONSIGNMENT[activeIdx];
  const consigned = year.vendors.filter((v) => v.group === "consignment");
  const otherBrands = year.vendors.filter((v) => v.group === "other_brands");
  const topVendors = year.vendors.slice(0, 10).map((v) => ({ name: v.name.split("/")[0].trim(), value: v.total }));

  const kpis: KpiData[] = [
    {
      label: `Consignment Sales (${year.label})`, value: `₹${L(year.total)}`, sub: `${year.vendors.length} active partners`, status: "green",
      definition: "Total sales of consignment and partner-brand goods for the fiscal year.",
      ...freshness,
    },
    {
      label: "Est. Commission Earned", value: `₹${L(year.commission)}`, sub: "At each partner's listed rate",
      definition: "Commission owed to partner vendors, estimated at each partner's own listed commission rate.",
      ...freshness,
    },
    {
      label: "Top Partner", value: year.vendors[0] ? year.vendors[0].name.split("/")[0].trim() : "-", sub: year.vendors[0] ? `₹${L(year.vendors[0].total)}` : "", status: "green",
      definition: "The partner vendor with the highest sales for the fiscal year.",
      ...freshness,
    },
    {
      label: "Sienna × Other Brands", value: `₹${L(otherBrands.reduce((a, v) => a + v.total, 0))}`, sub: `${otherBrands.length} brand collaborations`,
      definition: "Sales from brand collaborations (not consignment), for the fiscal year.",
      ...freshness,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Store - Consignment & Partner Brands
          </p>
          <TrackerImportBadge freshness={freshness} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CONSIGNMENT.map((y, i) => (
            <button
              key={y.fy}
              onClick={() => setFyIdx(i)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                i === activeIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {y.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <DashCard title={`Top Partners by Sales - ${year.label}`}>
        <ResponsiveContainer width="100%" height={Math.max(180, topVendors.length * 30)}>
          <BarChart data={topVendors} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={170} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" name="Sales" fill="#10b981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      <DashCard title={`All Partners - ${year.label}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Partner</th>
                <th className="py-2 pr-4 font-medium">Group</th>
                <th className="py-2 pr-4 font-medium text-right">Commission</th>
                <th className="py-2 font-medium text-right">Sales</th>
              </tr>
            </thead>
            <tbody>
              {[...consigned, ...otherBrands].map((v) => (
                <tr key={v.name} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 text-foreground">{v.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground text-xs">
                    {v.group === "other_brands" ? "Sienna × Other Brands" : "Consignment"}
                  </td>
                  <td className="py-2 pr-4 text-right text-muted-foreground">
                    {v.rate != null ? `${(v.rate * 100).toFixed(0)}%` : "-"}
                  </td>
                  <td className="py-2 text-right text-foreground">₹{L(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashCard>

      <p className="text-xs text-muted-foreground">
        Consignment sales are goods sold in Sienna stores on behalf of partner makers; commission is
        estimated at each partner&rsquo;s listed rate. FY 2026-27 covers April–May only so far.
      </p>
    </div>
  );
}
