import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { NAV_ITEMS, type NavItem } from './registry';
import { resolveNav, type ResolvedNav } from './resolve';

/** The navigation this user sees: registry filtered by can(), then layered
 *  overrides (none wired up yet). */
export function useNav(): ResolvedNav<NavItem> {
  const { user, can } = useAuth();
  const hasEmployee = !!user?.employee;
  return useMemo(
    () => resolveNav({ items: NAV_ITEMS, can, hasEmployee }),
    [can, hasEmployee],
  );
}
