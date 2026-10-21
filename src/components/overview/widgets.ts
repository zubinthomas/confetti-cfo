import type { ComponentType } from "react";
import type { WidgetProps } from "./Cell";
import * as G from "./GroupWidgets";
import * as Lead from "./LeadershipWidgets";

/** Components for the registry's OVERVIEW_WIDGETS, keyed by widget id. A test
 *  keeps the two lists in step. */
export const OVERVIEW_COMPONENTS: Record<string, ComponentType<WidgetProps>> = {
  "group.header": G.GroupHeader,
  "group.kpi.fnbRevenue": G.GroupKpiFnbRevenue,
  "group.kpi.storeRevenue": G.GroupKpiStoreRevenue,
  "group.kpi.fnbProfit": G.GroupKpiFnbProfit,
  "group.kpi.storePL": G.GroupKpiStorePL,
  "group.kpi.fnbLatest": G.GroupKpiFnbLatest,
  "group.kpi.storeLatest": G.GroupKpiStoreLatest,
  "group.targets": G.GroupTargets,
  "group.chart.monthlyRevenue": G.GroupMonthlyRevenue,
  "group.chart.monthlyPL": G.GroupMonthlyPL,
  "group.chart.annualRevenue": G.GroupAnnualRevenue,
  "group.chart.annualPL": G.GroupAnnualPL,
  "group.health": G.GroupHealth,

  "leadership.header": Lead.LeadershipHeader,
  "leadership.kpi.revenue": Lead.LeadershipKpiRevenue,
  "leadership.kpi.margin": Lead.LeadershipKpiMargin,
  "leadership.kpi.assets": Lead.LeadershipKpiAssets,
  "leadership.kpi.balanceCheck": Lead.LeadershipKpiBalanceCheck,
  "leadership.kpi.cashNet": Lead.LeadershipKpiCashNet,
  "leadership.kpi.storeFnbTarget": Lead.LeadershipKpiStoreFnbTarget,
  "leadership.interventions": Lead.LeadershipInterventions,
  "leadership.unavailable": Lead.LeadershipUnavailable,
  "leadership.footnote": Lead.LeadershipFootnote,
};
