import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { NAV_ITEMS, type NavItem } from './registry';
import { flattenLayers, resolveNav, type ResolvedNav } from './resolve';

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
