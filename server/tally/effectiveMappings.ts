// Resolves where each Tally ledger's values land, combining the ledger's own
// row with its group's default. Rule: a ledger with its own businessUnitId or
// lineItemId set is an override and ignores its group entirely (an unset
// field then means unmapped, not "fall back to the group"). Otherwise the
// ledger takes its group's businessUnitId, lineItemId, valueMode and
// periodGranularity. Only the immediate Tally group is known, so a ledger
// inside a nested group needs a mapping on that immediate group.
//
// Pure on purpose: no database import, so verify-effective-mappings.ts can run
// it without a server. The database loader is in loadEffectiveMappings.ts.
import type { schema } from '../db/client.ts';

export type TallyValueModeValue = 'balance' | 'period';
export type TallyPeriodGranularityValue = 'month' | 'week';

export interface EffectiveMapping {
  businessUnitId: number | null;
  lineItemId: number | null;
  valueMode: TallyValueModeValue;
  periodGranularity: TallyPeriodGranularityValue;
  /** 'ledger' when the ledger's own row decides, 'group' when its group does,
   *  null when neither is set. */
  inheritedFrom: 'ledger' | 'group' | null;
}

type LedgerRow = typeof schema.tallyLedgerMappings.$inferSelect;
type GroupRow = typeof schema.tallyGroupMappings.$inferSelect;

export function resolveEffectiveMapping(ledger: LedgerRow, group: GroupRow | undefined): EffectiveMapping {
  if (ledger.businessUnitId != null || ledger.lineItemId != null) {
    return {
      businessUnitId: ledger.businessUnitId,
      lineItemId: ledger.lineItemId,
      valueMode: ledger.valueMode,
      periodGranularity: ledger.periodGranularity,
      inheritedFrom: 'ledger',
    };
  }
  if (group && (group.businessUnitId != null || group.lineItemId != null)) {
    return {
      businessUnitId: group.businessUnitId,
      lineItemId: group.lineItemId,
      valueMode: group.valueMode,
      periodGranularity: group.periodGranularity,
      inheritedFrom: 'group',
    };
  }
  return {
    businessUnitId: null,
    lineItemId: null,
    valueMode: ledger.valueMode,
    periodGranularity: ledger.periodGranularity,
    inheritedFrom: null,
  };
}
