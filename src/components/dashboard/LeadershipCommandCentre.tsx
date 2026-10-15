import React, { useMemo } from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import StatusRow, { type StatusRowData } from "./StatusRow";
import PageSpinner from "./PageSpinner";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { useOverviewFiscalYears } from "@/hooks/useOverviewFiscalYears";
import { useOverviewYear } from "@/hooks/useOverviewYear";
import { useCashFlowYear } from "@/hooks/useCashFlowYear";
import { computeCompanyPL, resolveCplBu, resolveCplLi, type CompanyPL } from "@/data/companyPL";
import { computeBalanceSheet, latestAsOfPeriod, resolveBsBu, resolveBsLi, type BalanceSheet } from "@/data/balanceSheet";
import { targetSeries } from "@/data/revenueTargets";
import { UNAVAILABLE_METRICS, type StoreFnbTargetPace } from "@/data/leadershipOverview";
import { L, pct, sum, buildFrIndex, monthPeriodIds } from "@/data/seriesKernel";
import type { CashFlowYearData } from "@/data/cashFlowFinancials";

// Leadership's single landing view: the five standing questions from the
// client spec's "Executive leadership overview" (how's the business now /
// are we on target / what changed / what's next / where to intervene),
// answered from data already computed elsewhere - this page fetches and
// assembles, it doesn't recompute. See implementation-guidelines-gap-
// analysis.md section 5/15 for what's intentionally left as "not available"
// below rather than faked.
export default function LeadershipCommandCentre() {
  const { data: ref } = useReferenceData();
  const cplBu = ref ? resolveCplBu(ref.businessUnits) : -1;
  const bsBu = ref ? resolveBsBu(ref.businessUnits) : -1;

  const { data: cplRecords } = useFinancialRecords({
    businessUnitId: cplBu >= 0 ? [cplBu] : undefined,
    periodType: cplBu >= 0 ? ["month"] : undefined,
  });
  const { data: bsRecords } = useFinancialRecords({
    businessUnitId: bsBu >= 0 ? [bsBu] : undefined,
    periodType: bsBu >= 0 ? ["custom"] : undefined,
  });

  // Company P&L fiscal years - same derivation as ProfitLossPage.tsx (scan
  // records for what actually has data, rather than borrowing a different
  // business's fiscal-year hook).
  const companyPLFys = useMemo(() => {
    if (!ref) return undefined;
    if (cplBu < 0) return [];
    if (!cplRecords) return undefined;
    const periodById = new Map(ref.periods.map((p) => [p.id, p]));
    const set = new Set<string>();
    for (const r of cplRecords) {
      const period = periodById.get(r.periodId);
      if (period?.periodType === "month") set.add(period.fiscalYear);
    }
    return [...set].sort();
  }, [ref, cplRecords, cplBu]);
  const companyPLFy = companyPLFys?.at(-1);

  const companyPL = useMemo(() => {
    if (!ref || !cplRecords || !companyPLFy || cplBu < 0) return null;
    const idx = buildFrIndex(cplRecords);
    const li = resolveCplLi(ref.lineItems);
    return computeCompanyPL(idx, cplBu, li, monthPeriodIds(ref.periods, companyPLFy));
  }, [ref, cplRecords, companyPLFy, cplBu]);

  // Balance Sheet - latest point-in-time snapshot, same derivation as BalanceSheetPage.tsx.
  const bsAsOf = useMemo(() => {
    if (!ref) return undefined;
    if (bsBu < 0) return null;
    if (!bsRecords) return undefined;
    return latestAsOfPeriod(ref.periods, bsBu, bsRecords);
  }, [ref, bsRecords, bsBu]);

  const balanceSheet = useMemo(() => {
    if (!ref || !bsRecords || !bsAsOf || bsBu < 0) return null;
    const idx = buildFrIndex(bsRecords);
    const li = resolveBsLi(ref.lineItems);
    return computeBalanceSheet(idx, bsBu, li, bsAsOf.id);
  }, [ref, bsRecords, bsAsOf, bsBu]);

  // Group cash flow - latest fiscal year, same source as CashFlowTab.tsx.
  const overviewFys = useOverviewFiscalYears();
  const cashFlowFy = overviewFys?.at(-1);
  const cashFlow = useCashFlowYear(cashFlowFy);

  // Store + F&B revenue vs target - fixed to FY26-27/FY25-26, same scope as
  // Overview/Store/SiennaTab's own targets cards. This is the ONLY revenue
  // figure on this page that target data exists for; it is a different,
  // non-comparable number from the company P&L revenue above (see footnote).
  const overviewYear = useOverviewYear("2026-2027", "2025-2026");
  const { data: targets2627 } = useRevenueTargets({ category: ["store", "fnb"], fiscalYear: ["2026-2027"] });
  const targetPeriodIds = ref ? monthPeriodIds(ref.periods, "2026-2027") : [];
  const storeFnbTarget: StoreFnbTargetPace | null = useMemo(() => {
    if (!overviewYear || !targets2627) return null;
    const storeTarget = targetSeries(targets2627, "store", targetPeriodIds);
    const fnbTarget = targetSeries(targets2627, "fnb", targetPeriodIds);
    const { fb, store, totals, hasMonthlyDetail } = overviewYear.cur;

    if (hasMonthlyDetail) {
      // Compare actual-to-date against target-to-date (the same elapsed
      // months only) - summing the full-year target against a still-partial
      // actual would always read as "behind," regardless of real pacing.
      let actual = 0, target = 0;
      for (let i = 0; i < targetPeriodIds.length; i++) {
        if (fb.sales[i] == null && store.sales[i] == null) continue;
        actual += (fb.sales[i] ?? 0) + (store.sales[i] ?? 0);
        target += (storeTarget[i] ?? 0) + (fnbTarget[i] ?? 0);
      }
      return { actual, target, gap: actual - target };
    }

    // Annual-only fallback: totals are already full-year figures, so the
    // full-year target sum is the correct comparison here.
    const actual = totals.fbSales + totals.storeSales;
    const target = sum(storeTarget) + sum(fnbTarget);
    return { actual, target, gap: actual - target };
  }, [overviewYear, targets2627, targetPeriodIds]);

  if (!ref || companyPLFys === undefined) return <PageSpinner />;

  if (companyPLFys.length === 0) {
    return (
      <DashCard title="Leadership Command Centre">
        <p className="text-sm text-muted-foreground">
          No company-wide Profit &amp; Loss data has been pushed yet. This view populates
          automatically once the Tally agent syncs the "Profit &amp; Loss" business unit.
        </p>
      </DashCard>
    );
  }

  if (!companyPLFy || !companyPL) return <PageSpinner />;

  return (
    <Detail
      companyPL={companyPL}
      companyPLFy={companyPLFy}
      balanceSheet={balanceSheet}
      balanceSheetAsOfLabel={bsAsOf ? bsAsOf.endDate : null}
      cashFlow={cashFlow ?? null}
      storeFnbTarget={storeFnbTarget}
    />
  );
}

function Detail({
  companyPL, companyPLFy, balanceSheet, balanceSheetAsOfLabel, cashFlow, storeFnbTarget,
}: {
  companyPL: CompanyPL;
  companyPLFy: string;
  balanceSheet: BalanceSheet | null;
  balanceSheetAsOfLabel: string | null;
  cashFlow: CashFlowYearData | null;
  storeFnbTarget: StoreFnbTargetPace | null;
}) {
  const fyRevenue = sum(companyPL.revenue);
  const fyNetPL = sum(companyPL.netPL);
  const fyNetMarginPct = fyRevenue ? (fyNetPL / fyRevenue) * 100 : 0;

  const bsNearZero = balanceSheet
    ? Math.abs(balanceSheet.imbalance) < Math.max(1, balanceSheet.totalAssets * 0.001)
    : false;

  const cashHasDetail = !!cashFlow?.hasFullDetail;
  const cashNegativeMonths = cashHasDetail ? cashFlow!.net.filter((v) => v < 0).length : 0;
  const cashFyNet = cashHasDetail ? sum(cashFlow!.inflows) - sum(cashFlow!.outflows) : 0;

  const kpis: KpiData[] = [
    { label: "Company Revenue (FY, Tally)", value: `₹${L(fyRevenue)}`, href: `/finance/profit-loss?fy=${companyPLFy}` },
    {
      label: "Net Margin (FY, Tally)",
      value: pct(fyNetMarginPct),
      status: fyNetMarginPct >= 0 ? "green" : "red",
      href: `/finance/profit-loss?fy=${companyPLFy}`,
    },
    {
      label: `Total Assets${balanceSheetAsOfLabel ? ` (${balanceSheetAsOfLabel})` : ""}`,
      value: balanceSheet ? `₹${L(balanceSheet.totalAssets)}` : "Not available",
      href: balanceSheet ? "/finance/balance-sheet" : undefined,
    },
    {
      label: "Balance Check",
      value: balanceSheet ? (bsNearZero ? "Balanced" : `₹${L(balanceSheet.imbalance)} gap`) : "Not available",
      status: balanceSheet ? (bsNearZero ? "green" : "amber") : null,
      href: balanceSheet ? "/finance/balance-sheet" : undefined,
    },
    {
      label: `Group Cash Net${cashFlow ? ` (${cashFlow.label}, P&L basis)` : ""}`,
      value: cashHasDetail ? `₹${L(cashFyNet)}` : "Not available",
      status: cashHasDetail ? (cashFyNet >= 0 ? "green" : "red") : null,
      href: cashHasDetail ? `/cashflow?fy=${cashFlow!.fy}` : undefined,
    },
    {
      label: "Store + F&B vs Target (FY 26-27)",
      value: storeFnbTarget ? `${storeFnbTarget.gap >= 0 ? "+" : ""}₹${L(storeFnbTarget.gap)}` : "Not available",
      sub: "Store + F&B retail/outlet scope only",
      status: storeFnbTarget ? (storeFnbTarget.gap >= 0 ? "green" : "amber") : null,
      href: "/store?fy=2026-2027",
    },
  ];

  const healthChecks: StatusRowData[] = [
    {
      label: `Company net margin (${companyPLFy})`,
      status: fyNetMarginPct >= 0 ? "green" : "red",
      value: `${fyNetMarginPct.toFixed(1)}% - ${fyNetMarginPct >= 0 ? "profitable" : "loss-making"}`,
    },
  ];
  if (balanceSheet) {
    healthChecks.push({
      label: "Balance Sheet check",
      status: bsNearZero ? "green" : "amber",
      value: bsNearZero ? "Balanced" : `₹${L(balanceSheet.imbalance)} gap`,
    });
  }
  if (cashHasDetail) {
    healthChecks.push({
      label: `Cash-negative months (${cashFlow!.label})`,
      status: cashNegativeMonths > 3 ? "red" : cashNegativeMonths ? "amber" : "green",
      value: `${cashNegativeMonths}/12`,
    });
  }
  if (storeFnbTarget) {
    healthChecks.push({
      label: "Store + F&B revenue vs target",
      status: storeFnbTarget.gap >= 0 ? "green" : "amber",
      value: `${storeFnbTarget.gap >= 0 ? "+" : ""}₹${L(storeFnbTarget.gap)} vs target`,
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
        Leadership Command Centre
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <DashCard title="Where to Intervene">
        {healthChecks.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>

      <DashCard title="Not Yet Available">
        <ul className="space-y-2">
          {UNAVAILABLE_METRICS.map((m) => (
            <li key={m} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              {m}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          None of these are derivable from any source data connected today - shown here rather
          than silently left out, so the gap stays visible.
        </p>
      </DashCard>

      <p className="text-xs text-muted-foreground">
        Company Revenue and Net Margin above come from the Tally agent&rsquo;s consolidated
        Profit &amp; Loss push. The Store + F&B vs Target figure is a separate, narrower number
        from the Store and F&B sales trackers - the two are not the same revenue and must not be
        added together.
      </p>
    </div>
  );
}
