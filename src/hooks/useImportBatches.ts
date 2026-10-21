// Unlike useFinancialRecords/useReferenceData, this data can change in the
// background with no page reload - the Tally agent auto-commits a new batch
// on its own polling cycle - so a short staleTime instead of Infinity.
import { useQuery } from '@tanstack/react-query';
import { listBatches } from '@/api/importApi';
import { useAuth } from '@/lib/AuthContext';

export function useImportBatches() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['import-batches'],
    // Needs Import:read; without it the "imported on" badges just stay off.
    enabled: can('Import', 'read'),
    queryFn: listBatches,
    staleTime: 5 * 60 * 1000,
  });
}
