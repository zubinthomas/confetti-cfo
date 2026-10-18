// Static data for SpotlightSearch (src/components/SpotlightSearch.tsx) -
// pages/permissions mirror the route tree in src/App.tsx/src/DashboardApp.tsx,
// and business-unit/taxonomy routes mirror src/components/dashboard/DashboardShell.tsx's
// NAV_SECTIONS plus src/data/outletData.ts's Cafe-business outlet naming.
// Hand-authored, like DashboardShell's own EXTRA_TITLES map for standalone
// routes - needs a manual update if the route tree changes.
import type { PermissionAction } from '@/lib/AuthContext';

export interface SpotlightPage {
  to: string;
  label: string;
  /** Omitted entirely for a page that's open to any authenticated user
   *  (Roadmap, /me, /settings/user - see src/App.tsx/DashboardApp.tsx). */
  requires?: { resource: string; action: PermissionAction }[];
  /** Default 'all' (every requirement must hold), matching RequirePermission's
   *  own default - see src/components/RequirePermission.tsx. */
  mode?: 'all' | 'any';
}

export const SPOTLIGHT_PAGES: SpotlightPage[] = [
  { to: '/', label: 'Overview', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/fnb', label: 'F&B P&L', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/fnb/cafe', label: 'Cafe', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/fnb/restaurant', label: 'Restaurant', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/fnb/bar', label: 'Bar', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/fnb/events', label: 'Events', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/fnb/rannaghor', label: 'Rannaghor', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/store', label: 'Store P&L', mode: 'all', requires: [{ resource: 'FinancialRecord', action: 'read' }, { resource: 'SalesRecord', action: 'read' }] },
  { to: '/store/consignment', label: 'Consignment', requires: [{ resource: 'ConsignmentRecord', action: 'read' }] },
  { to: '/crafts/pottery', label: 'Pottery', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/crafts/batik', label: 'Batik', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/crafts/stitching', label: 'Stitching', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/crafts/trading-items', label: 'Trading Items', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/finance/profit-loss', label: 'Profit & Loss', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/finance/balance-sheet', label: 'Balance Sheet', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/cashflow', label: 'Cash Flow', requires: [{ resource: 'FinancialRecord', action: 'read' }] },
  { to: '/ai', label: 'AI Queries', requires: [{ resource: 'Integration', action: 'read' }] },
  { to: '/ops/production', label: 'Daily Production', requires: [{ resource: 'Operations', action: 'read' }] },
  { to: '/ops/items', label: 'Items Produced', requires: [{ resource: 'Operations', action: 'read' }] },
  { to: '/ops/quality', label: 'Rejection & QC', requires: [{ resource: 'Operations', action: 'read' }] },
  { to: '/ops/kiln-energy', label: 'Kiln & Energy', requires: [{ resource: 'Operations', action: 'read' }] },
  { to: '/ops/labour', label: 'Labour Efficiency', requires: [{ resource: 'Operations', action: 'read' }] },
  { to: '/ops/orders', label: 'Orders & Dispatch', requires: [{ resource: 'Operations', action: 'read' }] },
  { to: '/hr', label: 'HR Module', mode: 'any', requires: [{ resource: 'Employee', action: 'read' }, { resource: 'LeaveRequest', action: 'read' }, { resource: 'Recruitment', action: 'read' }] },
  { to: '/compliance', label: 'Compliance', requires: [{ resource: 'Licence', action: 'read' }] },
  { to: '/inventory', label: 'Inventory', requires: [{ resource: 'Inventory', action: 'read' }] },
  { to: '/reservations', label: 'Reservations', requires: [{ resource: 'Reservation', action: 'read' }] },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/data/import', label: 'Import Workbooks', mode: 'any', requires: [{ resource: 'Import', action: 'read' }, { resource: 'SheetSource', action: 'read' }] },
  { to: '/data/tally', label: 'Tally Integration', requires: [{ resource: 'TallySource', action: 'read' }] },
  { to: '/settings', label: 'General Settings', requires: [{ resource: 'Settings', action: 'read' }] },
  { to: '/settings/users', label: 'Users and Permissions', mode: 'any', requires: [{ resource: 'User', action: 'read' }, { resource: 'Invite', action: 'read' }, { resource: 'Role', action: 'read' }] },
  { to: '/settings/cost-centres', label: 'Cost Centres', requires: [{ resource: 'CostCentre', action: 'read' }] },
];

/** `requires`/`mode` check, mirroring RequirePermission.tsx's own logic
 *  exactly (src/components/RequirePermission.tsx) - a page with no
 *  `requires` at all is open to any authenticated user. */
export function pageIsVisible(page: SpotlightPage, can: (resource: string, action: PermissionAction) => boolean): boolean {
  if (!page.requires || page.requires.length === 0) return true;
  const checks = page.requires.map(({ resource, action }) => can(resource, action));
  return page.mode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
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
