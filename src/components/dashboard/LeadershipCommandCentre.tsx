import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import StatusBadge from "./StatusBadge";
import type { StatusRowData } from "./StatusRow";
import PageSpinner from "./PageSpinner";
import ReconciledBadge from "./ReconciledBadge";
import ExceptionAssignmentPanel from "./ExceptionAssignmentPanel";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useExceptionAssignments } from "@/hooks/useExceptionAssignments";
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
import type { Period } from "@/data/types";
import { useImportFreshness } from "@/hooks/useImportFreshness";

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
      bsAsOf={bsAsOf ?? null}
      cashFlow={cashFlow ?? null}
      storeFnbTarget={storeFnbTarget}
    />
  );
}

function Detail({
  companyPL, companyPLFy, balanceSheet, balanceSheetAsOfLabel, bsAsOf, cashFlow, storeFnbTarget,
}: {
  companyPL: CompanyPL;
  companyPLFy: string;
  balanceSheet: BalanceSheet | null;
  balanceSheetAsOfLabel: string | null;
  bsAsOf: Period | null;
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

  // Three freshness groups, not one blanket page-level source - this page
  // composites genuinely different pipelines (see the footnote below), so a
  // single "Tally" badge on every card would misrepresent the cash and
  // targets cards.
  const plFreshness = useImportFreshness(["tally"]);
  const cashFreshness = useImportFreshness(["cepl", "fnbMonthly", "fnbWeekly"]);
  const storeFnbFreshness = useImportFreshness(["sienna", "cepl", "fnbMonthly", "fnbWeekly", "target"]);

  const kpis: KpiData[] = [
    {
      label: "Company Revenue (FY, Tally)",
      value: `₹${L(fyRevenue)}`,
      href: `/finance/profit-loss?fy=${companyPLFy}`,
      definition: "Total company-wide revenue for the fiscal year, from the Tally agent's consolidated Profit & Loss push.",
      ...plFreshness,
    },
    {
      label: "Net Margin (FY, Tally)",
      value: pct(fyNetMarginPct),
      status: fyNetMarginPct >= 0 ? "green" : "red",
      href: `/finance/profit-loss?fy=${companyPLFy}`,
      definition: "Net profit as a percentage of company-wide revenue for the fiscal year, from the Tally P&L.",
      ...plFreshness,
    },
    {
      label: `Total Assets${balanceSheetAsOfLabel ? ` (${balanceSheetAsOfLabel})` : ""}`,
      value: balanceSheet ? `₹${L(balanceSheet.totalAssets)}` : "Not available",
      sub: balanceSheet ? undefined : "Not available",
      status: balanceSheet ? undefined : "grey",
      href: balanceSheet ? "/finance/balance-sheet" : undefined,
      definition: "Total assets on the company balance sheet as of the latest Tally sync, before liabilities are subtracted.",
      ...plFreshness,
    },
    {
      label: "Balance Check",
      value: balanceSheet ? (bsNearZero ? "Balanced" : `₹${L(balanceSheet.imbalance)} gap`) : "Not available",
      sub: balanceSheet ? undefined : "Not available",
      status: balanceSheet ? (bsNearZero ? "green" : "amber") : "grey",
      href: balanceSheet ? "/finance/balance-sheet" : undefined,
      definition: "Confirms the balance sheet balances - total assets should equal total liabilities plus equity. A non-zero gap usually means data is still mid-import or a ledger entry is missing.",
      ...plFreshness,
    },
    {
      label: `Group Cash Net${cashFlow ? ` (${cashFlow.label}, P&L basis)` : ""}`,
      value: cashHasDetail ? `₹${L(cashFyNet)}` : "Not available",
      sub: cashHasDetail ? undefined : "Not available",
      status: cashHasDetail ? (cashFyNet >= 0 ? "green" : "red") : "grey",
      href: cashHasDetail ? `/cashflow?fy=${cashFlow!.fy}` : undefined,
      definition: "Cash inflows minus outflows across all departments for the fiscal year, on a P&L (not bank-balance) basis - same figure as the Cash Flow page.",
      ...cashFreshness,
    },
    {
      label: "Store + F&B vs Target (FY 26-27)",
      value: storeFnbTarget ? `${storeFnbTarget.gap >= 0 ? "+" : ""}₹${L(storeFnbTarget.gap)}` : "Not available",
      sub: storeFnbTarget ? "Store + F&B retail/outlet scope only" : "Not available",
      status: storeFnbTarget ? (storeFnbTarget.gap >= 0 ? "green" : "amber") : "grey",
      href: "/store?fy=2026-2027",
      definition: "Actual Store and F&B retail/outlet revenue for FY 26-27 against the FY 26-27 target plan, elapsed months only. Not the same revenue figure as Company Revenue above.",
      ...storeFnbFreshness,
    },
  ];

  // The three items below carry a reason/action/owner/deadline (Section 2's
  // "red/amber exceptions carry a structured record") - scoped to this page's
  // go-fix-it list specifically, not the other StatusRow call sites, which
  // are page-local stats with no real destination to send someone to.
  // "Company net margin" stays a bare StatusRowData: it has no separate page
  // to link to (this page already is the company-margin view).
  type HealthCheckItem = { row: StatusRowData; exceptionKey?: string; reason?: string; href?: string };
  const { data: exceptionAssignments } = useExceptionAssignments();
  const hasAssignment = (key: string) => exceptionAssignments?.some((a) => a.exceptionKey === key
    && (a.ownerUserId != null || a.deadline != null || a.note != null));

  const healthChecks: HealthCheckItem[] = [
    {
      row: {
        label: `Company net margin (${companyPLFy})`,
        status: fyNetMarginPct >= 0 ? "green" : "red",
        value: `${fyNetMarginPct.toFixed(1)}% - ${fyNetMarginPct >= 0 ? "profitable" : "loss-making"}`,
      },
    },
  ];
  if (balanceSheet) {
    healthChecks.push({
      row: {
        label: "Balance Sheet check",
        status: bsNearZero ? "green" : "amber",
        value: bsNearZero ? "Balanced" : `₹${L(balanceSheet.imbalance)} gap`,
      },
      exceptionKey: "balance-sheet-check",
      reason: bsNearZero ? undefined : "Known reconciliation gap in Current Assets, traced to Sundry Debtors/Advance sub-ledgers with no parseable closing balance in Tally - see the Balance Sheet page.",
      href: "/finance/balance-sheet",
    });
  }
  if (cashHasDetail) {
    healthChecks.push({
      row: {
        label: `Cash-negative months (${cashFlow!.label})`,
        status: cashNegativeMonths > 3 ? "red" : cashNegativeMonths ? "amber" : "green",
        value: `${cashNegativeMonths}/12`,
      },
      exceptionKey: "cash-negative-months",
      href: `/cashflow?fy=${cashFlow!.fy}`,
    });
  }
  if (storeFnbTarget) {
    healthChecks.push({
      row: {
        label: "Store + F&B revenue vs target",
        status: storeFnbTarget.gap >= 0 ? "green" : "amber",
        value: `${storeFnbTarget.gap >= 0 ? "+" : ""}₹${L(storeFnbTarget.gap)} vs target`,
      },
      exceptionKey: "store-fnb-vs-target",
      href: "/store?fy=2026-2027",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Leadership Command Centre
        </p>
        <ReconciledBadge period={bsAsOf} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <DashCard title="Where to Intervene">
        {healthChecks.map((item, i) => {
          const showExtra = !!item.exceptionKey
            && (item.row.status !== "green" || hasAssignment(item.exceptionKey));
          return (
            <div
              key={item.row.label}
              className={i < healthChecks.length - 1 ? "border-b border-border" : ""}
            >
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-muted-foreground">{item.row.label}</span>
                <StatusBadge status={item.row.status}>{item.row.value}</StatusBadge>
              </div>
              {showExtra && (
                <div className="pb-3 -mt-1 space-y-1.5">
                  {item.reason && <p className="text-xs text-muted-foreground">{item.reason}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    {item.href && (
                      <Link to={item.href} className="text-xs text-primary hover:underline shrink-0">
                        View details
                      </Link>
                    )}
                    <ExceptionAssignmentPanel exceptionKey={item.exceptionKey!} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
