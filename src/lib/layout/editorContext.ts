import { NAV_ITEMS, OVERVIEW_AREA, OVERVIEW_WIDGETS, PAGE_TABS } from './registry';
import type { EditorContext } from './editor';
import type { CanFn } from './types';

/** The editor's view of the registry for a given viewer. */
export const editorContext = (can: CanFn, hasEmployee: boolean): EditorContext => ({
  navItems: NAV_ITEMS,
  tabs: PAGE_TABS,
  widgets: OVERVIEW_WIDGETS,
  areaId: OVERVIEW_AREA,
  can,
  hasEmployee,
});
