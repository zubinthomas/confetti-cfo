// Pure, parametrized consignment/partner-brand sales computation.
import type { ConsignmentRecord, Vendor } from "./types";
import { sum } from "./seriesKernel";

export interface ConsignmentVendorRow {
  name: string;
  group: Vendor["group"];
  rate: number | null;
  total: number;
}

export interface ConsignmentYearData {
  fy: string;
  label: string;
  vendors: ConsignmentVendorRow[];
  total: number;
  commission: number;
}

export function computeConsignmentYear(
  records: ConsignmentRecord[], vendors: Vendor[], fy: string, periodIds: number[]
): ConsignmentYearData {
  const rows = vendors
    .map((v) => ({
      name: v.name,
      group: v.group,
      rate: v.commissionRate,
      total: sum(
        records.filter((r) => r.vendorId === v.id && periodIds.includes(r.periodId)).map((r) => r.amount)
      ),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  return {
    fy,
    label: `FY ${fy.slice(2, 4)}-${fy.slice(7)}`,
    vendors: rows,
    total: sum(rows.map((r) => r.total)),
    commission: sum(rows.map((r) => r.total * (r.rate || 0))),
  };
}
