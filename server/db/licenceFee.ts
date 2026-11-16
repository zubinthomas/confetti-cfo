// A licence's fee is an amount per payment interval (licences.fee_amount,
// licences.fee_interval). The generic entity routes don't validate values, so
// writes to Licence go through this first. Keep the list in step with
// src/lib/licenceFee.ts.
export const FEE_INTERVALS = ['monthly', 'quarterly', 'half_yearly', 'annual'] as const;
export type FeeInterval = typeof FEE_INTERVALS[number];

export class LicenceFeeError extends Error {}

/** Throws on a bad fee_interval or fee_amount; fields that aren't sent are left alone. */
export function validateLicenceFee(body: unknown): void {
  if (!body || typeof body !== 'object') return;
  const { fee_interval: interval, fee_amount: amount } = body as Record<string, unknown>;
  if (interval !== undefined && !FEE_INTERVALS.includes(interval as FeeInterval)) {
    throw new LicenceFeeError(`Payment interval must be one of: ${FEE_INTERVALS.join(', ')}`);
  }
  if (amount !== undefined && amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) {
    throw new LicenceFeeError('Fee amount must be a number of 0 or more');
  }
}
