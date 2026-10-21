import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { PAGE_TABS, type PageId, type TabItem } from './registry';
import { flattenLayers, resolveTabs } from './resolve';

/** Tabs for a page: the registry list filtered by can(), then ordered, hidden
 *  and defaulted by the permission, role and user layers. `active` is whatever
 *  the user picked, falling back to the resolved default if that tab is gone. */
export function useTabs(pageId: PageId): { tabs: TabItem[]; active: string | null; setActive: (id: string) => void } {
  const { user, can } = useAuth();
  const layout = user?.layout;
  const resolved = useMemo(
    () => resolveTabs({ pageId, tabs: PAGE_TABS[pageId], can, layers: flattenLayers(layout) }),
    [pageId, can, layout],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const active = picked !== null && resolved.tabs.some((tab) => tab.id === picked) ? picked : resolved.defaultId;
  return { tabs: resolved.tabs, active, setActive: setPicked };
}
