// Spotlight search's network-backed result groups (employees, outstanding
// bills, reservations, roadmap items) - see src/components/SpotlightSearch.tsx.
// `q` should already be debounced by the caller (useDebouncedValue).
import { useQuery } from '@tanstack/react-query';
import { search } from '@/api/searchApi';

export function useSearch(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => search(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });
}
