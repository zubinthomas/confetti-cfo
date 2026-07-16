import React from "react";
import OutletPage, { MenuMixCard } from "./OutletPage";
import DashCard from "@/components/dashboard/DashCard";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import { menuMix, CAFE_EARLY_WEEKLY, CAFE_EARLY_WEEKS } from "@/data/fnbOutletData";
import { L } from "@/data/core";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const preSplit = CAFE_EARLY_WEEKS.map((w, i) => ({
  week: w.short,
  Revenue: CAFE_EARLY_WEEKLY.totalSales[i],
  "Net P&L": CAFE_EARLY_WEEKLY.pl[i],
}));

export default function CafePage() {
  return (
    <OutletPage
      outletKey="bosarGhor"
      heading="Cafe (Bosar Ghor)"
      description="The cafe section - pizzas, sandwiches, coffee and cafe specials - reported in the source workbook as the Bosar Ghor outlet."
    >
      <MenuMixCard items={menuMix("bosarGhor")} title="Menu Mix - Top Sellers (Sep 2025 onwards)" />

      <DashCard title="Whole-Cafe Weekly P&L - Apr–Aug 2025 (before the outlet split)">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={preSplit}>
            <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Net P&L" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          April–August 2025 is reported as one combined weekly cafe P&L in the source workbook (no
          Cafe / Restaurant / Rannaghor split exists for those weeks).
        </p>
      </DashCard>
    </OutletPage>
  );
}
