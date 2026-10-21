// Static data for SpotlightSearch (src/components/SpotlightSearch.tsx). The
// page list is derived from the nav registry (src/lib/layout/registry.ts), so
// it follows the route gates automatically. The business-unit and taxonomy
// routes below are hand-authored: they mirror the sidebar routes plus
// src/data/outletData.ts's Cafe-business outlet naming, and need a manual
// update if those routes move.
import type { PermissionAction } from '@/lib/AuthContext';
import { NAV_ITEMS } from '@/lib/layout/registry';
import { gateAllows } from '@/lib/layout/resolve';

export interface SpotlightPage {
  to: string;
  label: string;
  /** Omitted entirely for a page that's open to any authenticated user
   *  (Roadmap - see src/DashboardApp.tsx). */
  requires?: { resource: string; action: PermissionAction }[];
  /** Default 'all' (every requirement must hold), matching RequirePermission's
   *  own default - see src/components/RequirePermission.tsx. */
  mode?: 'all' | 'any';
}

export const SPOTLIGHT_PAGES: SpotlightPage[] = NAV_ITEMS
  .filter((item) => item.searchable !== false)
  .map((item) => ({
    to: item.to,
    label: item.title ?? item.label,
    requires: item.gate?.requires,
    mode: item.gate?.mode,
  }));

/** `requires`/`mode` check, same rule as RequirePermission.tsx - a page with
 *  no `requires` at all is open to any authenticated user. */
export function pageIsVisible(page: SpotlightPage, can: (resource: string, action: PermissionAction) => boolean): boolean {
  return gateAllows(page.requires ? { requires: page.requires, mode: page.mode } : undefined, can);
}

/** The 11 real business_units rows (see src/data/outletData.ts's
 *  CAFE_BUSINESS_ID comment for the Bosar Ghor/Dining Room outlet-rename
 *  context) mapped to the page that actually shows that unit's numbers.
 *  "Cafe" (the pre-outlet-split whole-cafe unit, id 7) and "Total" (the
 *  cafe business's own rollup row) have no page of their own - they fall
 *  back below. */
export const BUSINESS_UNIT_ROUTES: Record<string, string> = {
  'F&B': '/fnb',
  Store: '/store',
  'Trading Items': '/crafts/trading-items',
  Pottery: '/crafts/pottery',
  Batik: '/crafts/batik',
  Stitching: '/crafts/stitching',
  'Bosar Ghor': '/fnb/cafe',
  'Dining Room': '/fnb/restaurant',
  Rannaghor: '/fnb/rannaghor',
};
export const BUSINESS_UNIT_FALLBACK_ROUTE = '/finance/profit-loss';

/** Vendors/categories/channels only exist under the Store business and have
 *  no detail page of their own - route to the page that already renders
 *  that dimension. Line items are cross-business P&L rows -> the P&L page. */
export const TAXONOMY_ROUTES = {
  vendor: '/store/consignment',
  category: '/store',
  channel: '/store',
  costCentre: '/settings/cost-centres',
  lineItem: '/finance/profit-loss',
} as const;
