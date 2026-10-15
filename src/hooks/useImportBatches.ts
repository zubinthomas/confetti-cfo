// Unlike useFinancialRecords/useReferenceData, this data can change in the
// background with no page reload - the Tally agent auto-commits a new batch
// on its own polling cycle - so a short staleTime instead of Infinity.
import { useQuery } from '@tanstack/react-query';
import { listBatches } from '@/api/importApi';

export function useImportBatches() {
  return useQuery({
    queryKey: ['import-batches'],
    queryFn: listBatches,
    staleTime: 5 * 60 * 1000,
  });
}
