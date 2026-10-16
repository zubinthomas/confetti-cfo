// Page-level "source/updated" context for KPI cards - not per-figure, since
// financial_records carries no link back to the import batch that produced
// it. Resolves to the most recently committed batch across the given
// kind(s), which is the best approximation available without a schema
// change (see context-at-source plan).
import { useMemo } from 'react';
import { useImportBatches } from './useImportBatches';
import { IMPORT_KIND_LABELS } from '@/data/importKinds';
import type { ImportBatch } from '@/api/importApi';
import type { KpiStatus } from '@/components/dashboard/KpiCard';

export interface ImportFreshness {
  source: string;
  updatedAt: string;
  // true only when the latest batch is Tally-sourced and that source has
  // gone quiet beyond its own staleness threshold (see server/routes/
  // import.ts's computeSourceStale) - absent for every other kind, since
  // only Tally carries a heartbeat to judge staleness from.
  stale?: boolean;
}

export function useImportFreshness(kinds: ImportBatch['kind'][]): ImportFreshness | undefined {
  const { data: batches } = useImportBatches();

  return useMemo(() => {
    const committed = (batches ?? []).filter(
      (b) => b.status === 'committed' && b.committedAt && kinds.includes(b.kind),
    );
    const latest = committed.sort((a, b) => b.committedAt!.localeCompare(a.committedAt!))[0];
    if (!latest) return undefined;
    return {
      source: IMPORT_KIND_LABELS[latest.kind],
      updatedAt: latest.committedAt!,
      ...(latest.sourceStale != null && { stale: latest.sourceStale }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, kinds.join(',')]);
}

/** A stale sync doesn't mean "no data" (that's grey's job) - it means "this
 *  real number might be out of date." Downgrades a colored status to amber
 *  so a stale Tally page doesn't keep showing confident green/red reads;
 *  leaves grey/null alone, since there's nothing to downgrade when a card is
 *  already saying "no data exists." */
export function downgradeIfStale(status: KpiStatus | null | undefined, freshness?: ImportFreshness): KpiStatus | null | undefined {
  if (!freshness?.stale || !status || status === 'grey') return status;
  return 'amber';
}
