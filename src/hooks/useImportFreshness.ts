// Page-level "source/updated" context for KPI cards - not per-figure, since
// financial_records carries no link back to the import batch that produced
// it. Resolves to the most recently committed batch across the given
// kind(s), which is the best approximation available without a schema
// change (see context-at-source plan).
import { useMemo } from 'react';
import { useImportBatches } from './useImportBatches';
import { IMPORT_KIND_LABELS } from '@/data/importKinds';
import type { ImportBatch } from '@/api/importApi';

export interface ImportFreshness {
  source: string;
  updatedAt: string;
}

export function useImportFreshness(kinds: ImportBatch['kind'][]): ImportFreshness | undefined {
  const { data: batches } = useImportBatches();

  return useMemo(() => {
    const committed = (batches ?? []).filter(
      (b) => b.status === 'committed' && b.committedAt && kinds.includes(b.kind),
    );
    const latest = committed.sort((a, b) => b.committedAt!.localeCompare(a.committedAt!))[0];
    return latest ? { source: IMPORT_KIND_LABELS[latest.kind], updatedAt: latest.committedAt! } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, kinds.join(',')]);
}
