import React from "react";
import OutletPage, { MenuMixCard } from "./OutletPage";
import DashCard from "@/components/dashboard/DashCard";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import { menuMix, CAFE_MONTHLY, CAFE_MONTH_LABELS, L } from "@/data/financialData";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const preSplit = CAFE_MONTH_LABELS.map((m, i) => ({
  month: m,
  Revenue: CAFE_MONTHLY.totalSales[i],
  "Net P&L": CAFE_MONTHLY.pl[i],
}));

export default function CafePage() {
  return (
    <OutletPage
      outletKey="bosarGhor"
      heading="Cafe (Bosar Ghor)"
      description="The cafe section — pizzas, sandwiches, coffee and cafe specials — reported in the source workbook as the Bosar Ghor outlet."
    >
      <MenuMixCard items={menuMix("bosarGhor")} title="Menu Mix — Top Sellers (Sep 2025 onwards)" />

      <DashCard title="Whole-Cafe Monthly P&L — Apr–Aug 2025 (before the outlet split)">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={preSplit}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Net P&L" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          April–August 2025 is reported as one combined cafe P&L in the source workbook (no
          Cafe / Restaurant / Rannaghor split exists for those months).
        </p>
      </DashCard>
    </OutletPage>
  );
}
