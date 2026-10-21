// Current owner/deadline/note per exceptionKey (server/routes/exceptions.ts) -
// small table, fetched whole. Shared by the Leadership overview data (to decide
// whether a resolved item still needs its assignment block shown) and
// ExceptionAssignmentPanel (to display/edit one row); react-query dedupes
// the underlying request between them.
import { useQuery } from '@tanstack/react-query';
import { listExceptionAssignments } from '@/api/exceptionsApi';
import { useAuth } from '@/lib/AuthContext';

export function useExceptionAssignments() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['exception-assignments'],
    enabled: can('ExceptionAssignment', 'read'),
    queryFn: listExceptionAssignments,
    staleTime: 5 * 60 * 1000,
  });
}
