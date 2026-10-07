// Checks the ledger-over-group rule in effectiveMappings.ts. Run with:
//   node tally/verify-effective-mappings.ts
import assert from 'node:assert/strict';
import { resolveEffectiveMapping } from './effectiveMappings.ts';

const base = { id: 1, tallySourceId: 1, ledgerName: 'L', groupName: 'G', createdAt: '' };
const ledger = (over: Record<string, unknown> = {}) => ({
  ...base, businessUnitId: null, lineItemId: null, valueMode: 'balance' as const, periodGranularity: 'month' as const, ...over,
}) as Parameters<typeof resolveEffectiveMapping>[0];
const group = (over: Record<string, unknown> = {}) => ({
  id: 1, tallySourceId: 1, groupName: 'G', businessUnitId: 10, lineItemId: 20, valueMode: 'balance' as const, periodGranularity: 'month' as const, createdAt: '', ...over,
}) as Parameters<typeof resolveEffectiveMapping>[1];

// 1. Ledger with its own assignment ignores its group, even when the group is set.
assert.deepEqual(
  resolveEffectiveMapping(ledger({ businessUnitId: 11, lineItemId: 21 }), group()),
  { businessUnitId: 11, lineItemId: 21, valueMode: 'balance', periodGranularity: 'month', inheritedFrom: 'ledger' },
);

// 2. Ledger with no assignment takes the group's values, including valueMode.
assert.deepEqual(
  resolveEffectiveMapping(ledger(), group({ valueMode: 'period', periodGranularity: 'week' })),
  { businessUnitId: 10, lineItemId: 20, valueMode: 'period', periodGranularity: 'week', inheritedFrom: 'group' },
);

// 3. Neither set: unmapped, nothing inherited.
assert.deepEqual(
  resolveEffectiveMapping(ledger(), group({ businessUnitId: null, lineItemId: null })),
  { businessUnitId: null, lineItemId: null, valueMode: 'balance', periodGranularity: 'month', inheritedFrom: null },
);
assert.deepEqual(
  resolveEffectiveMapping(ledger(), undefined),
  { businessUnitId: null, lineItemId: null, valueMode: 'balance', periodGranularity: 'month', inheritedFrom: null },
);

// 4. A ledger with only a business unit is an override, so the group does not
//    fill in the line item. The result is unmapped, which is what the sync needs.
const partial = resolveEffectiveMapping(ledger({ businessUnitId: 11 }), group());
assert.equal(partial.inheritedFrom, 'ledger');
assert.equal(partial.lineItemId, null);

// 5. A group with only a business unit is not a usable default, so an unset
//    ledger stays unmapped.
const halfGroup = resolveEffectiveMapping(ledger(), group({ lineItemId: null }));
assert.equal(halfGroup.businessUnitId, 10);
assert.equal(halfGroup.lineItemId, null);

console.log('effective mapping checks passed (5 cases)');
