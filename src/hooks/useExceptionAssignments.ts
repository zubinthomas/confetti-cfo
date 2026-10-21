// Current owner/deadline/note per exceptionKey (server/routes/exceptions.ts) -
// small table, fetched whole. Shared by the Leadership overview data (to decide
// whether a resolved item still needs its assignment block shown) and
// ExceptionAssignmentPanel (to display/edit one row); react-query dedupes
// the underlying request between them.
import { useQuery } from '@tanstack/react-query';
import { listExceptionAssignments } from '@/api/exceptionsApi';

export function useExceptionAssignments() {
  return useQuery({
    queryKey: ['exception-assignments'],
    queryFn: listExceptionAssignments,
    staleTime: 5 * 60 * 1000,
  });
}
