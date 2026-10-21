import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { OVERVIEW_AREA, OVERVIEW_WIDGETS, type OverviewWidget } from './registry';
import { flattenLayers, resolveWidgets, type ResolvedWidget } from './resolve';

/** The overview widgets this user sees, in order with widths: the registry
 *  filtered by can(), then the permission, role and user layers applied. */
export function useOverviewWidgets(): ResolvedWidget<OverviewWidget>[] {
  const { user, can } = useAuth();
  const layout = user?.layout;
  return useMemo(
    () => resolveWidgets({ areaId: OVERVIEW_AREA, widgets: OVERVIEW_WIDGETS, can, layers: flattenLayers(layout) }),
    [can, layout],
  );
}
