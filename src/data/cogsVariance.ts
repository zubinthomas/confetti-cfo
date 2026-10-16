// Theoretical-vs-actual COGS variance: how much the inventory ledger's own
// "out" transactions say a business unit should have consumed, compared to
// the department P&L's actual reported COGS line (deptFinancials.ts's
// `cogs` series). Deliberately a frontend pure module, not a server
// computation - this app's convention is that all financial aggregation
// lives in src/data/*.ts, operating on data the frontend already fetched
// (see cashFlowFinancials.ts, companyPL.ts); the server only ever does flat
// filtered selects (listTransactionsForBusinessUnit).
//
// Caveat baked into the "theoretical" figure, surfaced wherever this is
// shown: inventory_transactions.type is only "in"|"out" - there's no
// waste/spoilage/adjustment sub-type, so this necessarily includes any
// waste recorded as a plain "out" alongside genuine sale-driven consumption.
import type { BusinessUnitTransaction } from "@/api/inventoryApi";

export interface CogsVarianceResult {
  theoretical: number | null;
  actual: number | null;
  variance: number | null; // actual - theoretical; positive = spent more than the ledger implies it should have
  variancePct: number | null; // variance as a % of theoretical
}

// Batch cost if the "out" was against a tracked batch, else the item's
// current unitCost - the same resolution order inventoryLedger.ts's
// applyLedgerEffect uses when recording a transaction.
export function computeTheoreticalCogs(transactions: BusinessUnitTransaction[]): number | null {
  let total = 0;
  let any = false;
  for (const t of transactions) {
    const cost = t.batchUnitCost ?? t.itemUnitCost;
    if (cost == null) continue;
    total += t.quantity * cost;
    any = true;
  }
  return any ? total : null;
}

export function computeCogsVariance(theoretical: number | null, actual: number | null): CogsVarianceResult {
  if (theoretical == null || actual == null || theoretical === 0) {
    return { theoretical, actual, variance: null, variancePct: null };
  }
  const variance = actual - theoretical;
  return { theoretical, actual, variance, variancePct: (variance / theoretical) * 100 };
}
