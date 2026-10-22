import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { NAV_ITEMS, type NavItem } from './registry';
import { flattenLayers, navDestinationCount, resolveNav, soleDestination, type ResolvedNav } from './resolve';

/** The navigation this user sees: registry filtered by can(), then the
 *  permission, role and user layers from /auth/me applied in that order. */
export function useNav(): ResolvedNav<NavItem> {
  const { user, can } = useAuth();
  const hasEmployee = !!user?.employee;
  const layout = user?.layout;
  return useMemo(
    () => resolveNav({ items: NAV_ITEMS, can, hasEmployee, layers: flattenLayers(layout) }),
    [can, hasEmployee, layout],
  );
}

/** True when the sidebar and top bar together offer at most one place to go.
 *  There is nothing to browse, so the shell drops them and keeps only the user
 *  menu (and the page itself). */
export function useCompactNav(): boolean {
  return navDestinationCount(useNav()) <= 1;
}

/** The single page a compact-nav person has, or null when the nav isn't compact. */
export function useSoleDestination(): NavItem | null {
  return soleDestination(useNav());
}
