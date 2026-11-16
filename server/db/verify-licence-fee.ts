// Checks the licence fee validation (no database needed).
//   node db/verify-licence-fee.ts  (not wired into package.json: that file has unrelated uncommitted edits)
import assert from 'node:assert/strict';
import { validateLicenceFee, LicenceFeeError } from './licenceFee.ts';

const bad = (body: unknown, re: RegExp) => assert.throws(() => validateLicenceFee(body), (e: unknown) => e instanceof LicenceFeeError && re.test(e.message));

validateLicenceFee({});
validateLicenceFee(undefined);
validateLicenceFee({ fee_interval: 'quarterly', fee_amount: 5000 });
validateLicenceFee({ fee_interval: 'half_yearly', fee_amount: 0 });
validateLicenceFee({ fee_amount: null });
validateLicenceFee({ licence_name: 'untouched fields are fine' });
bad({ fee_interval: 'weekly' }, /Payment interval/);
bad({ fee_interval: '' }, /Payment interval/);
bad({ fee_interval: null }, /Payment interval/);
bad({ fee_amount: -1 }, /Fee amount/);
bad({ fee_amount: '5000' }, /Fee amount/);
bad({ fee_amount: Number.NaN }, /Fee amount/);

console.log('licence fee checks passed');
