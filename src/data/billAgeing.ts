// Receivables/payables ageing, computed from Tally's bill-wise sync
// (server/routes/bills.ts -> src/api/billsApi.ts). Pure, frontend-only -
// this app's convention of computing over already-fetched data client-side,
// same as cashForecast.ts.
//
// Buckets are computed live from each bill's own dueDate against asOfDate,
// not from Tally's own BILLOVERDUE snapshot (deliberately excluded from the
// wire payload - server/import/types.ts) - that field is only as fresh as
// the last sync cycle, while dueDate vs. "now" is always current.
import type { OutstandingBill } from "@/api/billsApi";

export type AgeingBucket = "current" | "0-30" | "31-60" | "61-90" | "90+";

export interface AgeingBucketTotal {
  bucket: AgeingBucket;
  count: number;
  amount: number;
}

export interface AgeingSummary {
  totalAmount: number;
  totalCount: number;
  buckets: AgeingBucketTotal[];
}

const BUCKET_ORDER: AgeingBucket[] = ["current", "0-30", "31-60", "61-90", "90+"];

/** A bill with no dueDate at all (Tally's voucher didn't carry one) is
 *  treated as "current" rather than dropped - its amount is real and still
 *  belongs in the total, it just can't be aged. */
function bucketFor(dueDate: string | null, asOfDate: string): AgeingBucket {
  if (!dueDate) return "current";
  const daysOverdue = Math.floor((Date.parse(asOfDate) - Date.parse(dueDate)) / 86400000);
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

function summarize(bills: OutstandingBill[], asOfDate: string): AgeingSummary {
  const byBucket = new Map<AgeingBucket, AgeingBucketTotal>(
    BUCKET_ORDER.map((bucket) => [bucket, { bucket, count: 0, amount: 0 }])
  );
  let totalAmount = 0;
  for (const bill of bills) {
    const bucket = byBucket.get(bucketFor(bill.dueDate, asOfDate))!;
    bucket.count += 1;
    bucket.amount += bill.outstandingAmount;
    totalAmount += bill.outstandingAmount;
  }
  return { totalAmount, totalCount: bills.length, buckets: [...byBucket.values()] };
}

export interface BillAgeing {
  asOfDate: string;
  receivables: AgeingSummary;
  payables: AgeingSummary;
}

export function computeAgeingBuckets(bills: OutstandingBill[], asOfDate: string): BillAgeing {
  return {
    asOfDate,
    receivables: summarize(bills.filter((b) => b.nature === "receivable"), asOfDate),
    payables: summarize(bills.filter((b) => b.nature === "payable"), asOfDate),
  };
}
