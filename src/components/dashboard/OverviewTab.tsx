import React, { useState } from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import StatusRow, { type StatusRowData } from "./StatusRow";
import PageSpinner from "./PageSpinner";
import { useOverviewFiscalYears } from "@/hooks/useOverviewFiscalYears";
import { useOverviewYear } from "@/hooks/useOverviewYear";
import { useFnbStoreHistory } from "@/hooks/useFnbStoreHistory";
import { MONTHS, L, lastValidIdx, fyLabel } from "@/data/seriesKernel";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

interface TooltipPayloadItem { color: string; name: string; value: number }
const CustomTooltip = ({ active = false, payload = [], label = "" }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span style={{ color: p.color }}>●</span> {p.name}: {L(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function OverviewTab() {
  const fys = useOverviewFiscalYears();
  const [selectedFy, setSelectedFy] = useState<string | null>(null);
  const fy = selectedFy ?? fys?.at(-1);
  const fyIdx = fys && fy ? fys.indexOf(fy) : -1;
  const prevFY = fys && fyIdx > 0 ? fys[fyIdx - 1] : null;
  const overview = useOverviewYear(fy, prevFY);
  const fnbStoreHistory = useFnbStoreHistory();

  if (!fys || !fy || !overview || !fnbStoreHistory) return <PageSpinner />;

  const CUR = overview.cur;
  const prevTotals = overview.prev?.totals ?? null;

  // Multi-year F&B + Store history (annual sales & P&L, from the workbook's
  // Overview sheet for FY21-22 … 24-25 and the department sheets for FY25-26)
  // - always shows every year, independent of the selector below.
  const historyData = fnbStoreHistory.map((y) => ({
    year: y.label,
    "F&B Revenue": y.fb.sales,
    "Store Revenue": y.store.sales,
    "F&B P&L": y.fb.pl,
    "Store P&L": y.store.pl,
  }));

  const monthlyData = MONTHS.map((m, i) => ({
    month: m,
    "F&B Sales":   CUR.fb.sales[i],
    "Store Sales": CUR.store.sales[i],
    "F&B P&L":     CUR.fb.pl[i],
    "Store P&L":   CUR.store.pl[i],
  }));

  const LATEST_IDX = lastValidIdx(CUR.fb.sales);
  const latestMonthLabel = LATEST_IDX >= 0 ? MONTHS[LATEST_IDX] : null;

  const fbMargin = CUR.totals.fbSales ? (CUR.totals.fbPL / CUR.totals.fbSales) * 100 : 0;
  const storeMargin = CUR.totals.storeSales ? (CUR.totals.storePL / CUR.totals.storeSales) * 100 : 0;
  const storeGrowthVsPrevYear = prevTotals?.storeSales
    ? ((CUR.totals.storeSales / prevTotals.storeSales) - 1) * 100 : null;
  const fbGrowthVsPrevYear = prevTotals?.fbSales
    ? ((CUR.totals.fbSales / prevTotals.fbSales) - 1) * 100 : null;

  const kpis: KpiData[] = [
    { label: `F&B Revenue (${CUR.label})`, value: L(CUR.totals.fbSales), sub: `${fbMargin.toFixed(1)}% net margin`, status: "green" },
    {
      label: `Store Revenue (${CUR.label})`, value: L(CUR.totals.storeSales),
      sub: prevFY && storeGrowthVsPrevYear != null
        ? `${storeGrowthVsPrevYear >= 0 ? "+" : ""}${storeGrowthVsPrevYear.toFixed(0)}% vs ${fyLabel(prevFY)}`
        : "No prior year to compare",
      status: "green",
    },
    { label: "F&B Net Profit (FY)", value: L(CUR.totals.fbPL), sub: `${fbMargin.toFixed(1)}% margin`, status: "green" },
    { label: "Store Net P&L (FY)", value: L(CUR.totals.storePL), sub: `${storeMargin.toFixed(1)}% margin`, status: CUR.totals.storePL > 0 ? "green" : "amber" },
  ];
  if (CUR.hasMonthlyDetail && LATEST_IDX >= 0) {
    kpis.push(
      { label: `F&B Revenue (${latestMonthLabel})`, value: L(CUR.fb.sales[LATEST_IDX]), sub: `${CUR.fb.plPct[LATEST_IDX]}% net margin`, status: "green" },
      {
        label: `Store Revenue (${latestMonthLabel})`, value: L(CUR.store.sales[LATEST_IDX]),
        sub: `${(CUR.store.plPct[LATEST_IDX] as number) > 0 ? "+" : ""}${CUR.store.plPct[LATEST_IDX]}% margin`,
        status: (CUR.store.plPct[LATEST_IDX] as number) > 0 ? "green" : "amber",
      },
    );
  }

  const bestFbIdx = CUR.fb.plPct.length ? CUR.fb.plPct.indexOf(Math.max(...(CUR.fb.plPct as number[]))) : -1;
  const worstFbIdx = CUR.fb.plPct.length ? CUR.fb.plPct.indexOf(Math.min(...(CUR.fb.plPct as number[]))) : -1;

  const statusItems: StatusRowData[] = [
    { label: "F&B FY net margin", status: fbMargin > 0 ? "green" : "red", value: `${fbMargin.toFixed(1)}% - ${fbMargin > 0 ? "profitable" : "loss-making"}` },
    { label: "Store FY net margin", status: storeMargin > 0 ? "green" : "amber", value: `${storeMargin.toFixed(1)}%` },
  ];
  if (bestFbIdx >= 0) {
    statusItems.push({ label: "F&B best margin month", status: "green", value: `${MONTHS[bestFbIdx]} - ${CUR.fb.plPct[bestFbIdx]}%` });
  }
  if (worstFbIdx >= 0) {
    statusItems.push({ label: "F&B weakest margin month", status: "amber", value: `${MONTHS[worstFbIdx]} - ${CUR.fb.plPct[worstFbIdx]}%` });
  }
  if (prevFY && storeGrowthVsPrevYear != null) {
    statusItems.push({
      label: `Store revenue vs ${fyLabel(prevFY)}`,
      status: storeGrowthVsPrevYear >= 0 ? "green" : "amber",
      value: `${storeGrowthVsPrevYear >= 0 ? "+" : ""}${storeGrowthVsPrevYear.toFixed(0)}% YoY`,
    });
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Group Snapshot - {CUR.label}
          </p>
          <div className="flex gap-1.5">
            {fys.map((y) => (
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      {CUR.hasMonthlyDetail ? (
        <>
          {/* Monthly Revenue Chart */}
          <DashCard title={`Monthly Revenue - F&B vs Store (${CUR.label})`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} barGap={2}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="F&B Sales"   fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="Store Sales" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </DashCard>

          {/* Monthly P&L Chart */}
          <DashCard title={`Monthly Net P&L - F&B vs Store (${CUR.label})`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="3 3" />
                <Line dataKey="F&B P&L"   stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line dataKey="Store P&L" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </DashCard>
        </>
      ) : (
        <DashCard title={`Monthly detail - ${CUR.label}`}>
          <p className="text-sm text-muted-foreground">
            Monthly P&L detail isn&rsquo;t available for {CUR.label} yet - only annual totals from
            the workbook&rsquo;s Overview sheet are shown above. Once a CEPL P&L workbook with
            department-level monthly data is imported for this year, monthly charts will appear
            here automatically.
          </p>
        </DashCard>
      )}

      {/* Multi-year annual history - F&B + Store revenue and P&L */}
      <DashCard title="Annual Revenue - F&B vs Store (FY 21-22 → 25-26)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={historyData} barGap={2}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="F&B Revenue" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="Store Revenue" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          F&B revenue grew {(((fnbStoreHistory.at(-1)!.fb.sales / fnbStoreHistory.at(-2)!.fb.sales) - 1) * 100) >= 0 ? "+" : ""}
          {((((fnbStoreHistory.at(-1)!.fb.sales / fnbStoreHistory.at(-2)!.fb.sales) - 1) * 100)).toFixed(0)}% in FY 25-26 -
          its first strongly profitable year (₹{L(fnbStoreHistory.at(-1)!.fb.pl)} net) after
          {" "}₹{L(Math.abs(fnbStoreHistory.at(-2)!.fb.pl))} of losses in FY 24-25.
        </p>
      </DashCard>

      <DashCard title="Annual Net P&L - F&B vs Store (FY 21-22 → 25-26)">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={historyData} barGap={2}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="F&B P&L" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="Store P&L" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      {/* Status */}
      <DashCard title="Performance Health Check">
        {statusItems.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>
    </div>
  );
}
