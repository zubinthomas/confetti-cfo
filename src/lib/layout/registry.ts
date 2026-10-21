// Single source of truth for navigation. The sidebar, header links, user menu,
// page titles, spotlight search and the route gates in App.tsx/DashboardApp.tsx
// all read from here, so what a user sees in the nav can't drift from what the
// router lets them open.
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, UtensilsCrossed, Coffee, Soup, Wine, PartyPopper, CookingPot,
  Store, Handshake, Factory, Paintbrush, Scissors, Package, Banknote, Sparkles,
  ClipboardList, ShieldAlert, Flame, HardHat, Truck, Users, ShieldCheck, Boxes, CalendarDays,
  FileBarChart, Scale, UserCog, Settings, FileSpreadsheet, Cable, IdCard, Map as MapIcon, Layers,
} from 'lucide-react';
import type { Gate, NavItemBase } from './types';

const read = (resource: string) => ({ resource, action: 'read' as const });

/** Route gates, shared by the router and the nav items below. */
export const GATES = {
  financial: { requires: [read('FinancialRecord')] },
  store: { mode: 'all', requires: [read('FinancialRecord'), read('SalesRecord')] },
  consignment: { requires: [read('ConsignmentRecord')] },
  ai: { requires: [read('Integration')] },
  operations: { requires: [read('Operations')] },
  hr: { mode: 'any', requires: [read('Employee'), read('LeaveRequest'), read('Recruitment')] },
  compliance: { requires: [read('Licence')] },
  inventory: { requires: [read('Inventory')] },
  reservations: { requires: [read('Reservation')] },
  import: { mode: 'any', requires: [read('Import'), read('SheetSource')] },
  tally: { requires: [read('TallySource')] },
  settings: { requires: [read('Settings')] },
  users: { mode: 'any', requires: [read('User'), read('Invite'), read('Role')] },
  costCentres: { requires: [read('CostCentre')] },
} satisfies Record<string, Gate>;

export interface NavItem extends NavItemBase {
  icon: LucideIcon;
}

// Order matters: it is the default order within each placement, and sidebar
// sections appear in the order their group first shows up.
export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', to: '/', icon: LayoutDashboard, group: null, end: true, defaultPlacement: 'sidebar', gate: GATES.financial },

  { id: 'fnb', label: 'F&B P&L', to: '/fnb', icon: UtensilsCrossed, group: 'F&B', end: true, defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'fnb-cafe', label: 'Cafe', to: '/fnb/cafe', icon: Coffee, group: 'F&B', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'fnb-restaurant', label: 'Restaurant', to: '/fnb/restaurant', icon: Soup, group: 'F&B', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'fnb-bar', label: 'Bar', to: '/fnb/bar', icon: Wine, group: 'F&B', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'fnb-events', label: 'Events', to: '/fnb/events', icon: PartyPopper, group: 'F&B', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'fnb-rannaghor', label: 'Rannaghor', to: '/fnb/rannaghor', icon: CookingPot, group: 'F&B', defaultPlacement: 'sidebar', gate: GATES.financial },

  { id: 'store', label: 'Store P&L', to: '/store', icon: Store, group: 'Retail', end: true, defaultPlacement: 'sidebar', gate: GATES.store },
  { id: 'store-consignment', label: 'Consignment', to: '/store/consignment', icon: Handshake, group: 'Retail', defaultPlacement: 'sidebar', gate: GATES.consignment },

  { id: 'craft-pottery', label: 'Pottery', to: '/crafts/pottery', icon: Factory, group: 'Non-F&B', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'craft-batik', label: 'Batik', to: '/crafts/batik', icon: Paintbrush, group: 'Non-F&B', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'craft-stitching', label: 'Stitching', to: '/crafts/stitching', icon: Scissors, group: 'Non-F&B', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'craft-trading-items', label: 'Trading Items', to: '/crafts/trading-items', icon: Package, group: 'Non-F&B', defaultPlacement: 'sidebar', gate: GATES.financial },

  { id: 'finance-pl', label: 'Profit & Loss', to: '/finance/profit-loss', icon: FileBarChart, group: 'Finance', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'finance-bs', label: 'Balance Sheet', to: '/finance/balance-sheet', icon: Scale, group: 'Finance', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'cashflow', label: 'Cash Flow', to: '/cashflow', icon: Banknote, group: 'Finance', defaultPlacement: 'sidebar', gate: GATES.financial },
  { id: 'ai', label: 'AI Queries', to: '/ai', icon: Sparkles, group: 'Finance', defaultPlacement: 'sidebar', gate: GATES.ai },

  { id: 'ops-production', label: 'Daily Production', to: '/ops/production', icon: ClipboardList, group: 'Operations', defaultPlacement: 'sidebar', gate: GATES.operations },
  { id: 'ops-items', label: 'Items Produced', to: '/ops/items', icon: Package, group: 'Operations', defaultPlacement: 'sidebar', gate: GATES.operations },
  { id: 'ops-quality', label: 'Rejection & QC', to: '/ops/quality', icon: ShieldAlert, group: 'Operations', defaultPlacement: 'sidebar', gate: GATES.operations },
  { id: 'ops-kiln-energy', label: 'Kiln & Energy', to: '/ops/kiln-energy', icon: Flame, group: 'Operations', defaultPlacement: 'sidebar', gate: GATES.operations },
  { id: 'ops-labour', label: 'Labour Efficiency', to: '/ops/labour', icon: HardHat, group: 'Operations', defaultPlacement: 'sidebar', gate: GATES.operations },
  { id: 'ops-orders', label: 'Orders & Dispatch', to: '/ops/orders', icon: Truck, group: 'Operations', defaultPlacement: 'sidebar', gate: GATES.operations },

  // Standalone modules: header by default, which is where they sat before.
  { id: 'hr', label: 'HR Module', to: '/hr', icon: Users, group: 'Modules', defaultPlacement: 'header', gate: GATES.hr },
  { id: 'compliance', label: 'Compliance', to: '/compliance', icon: ShieldCheck, group: 'Modules', defaultPlacement: 'header', gate: GATES.compliance },
  { id: 'inventory', label: 'Inventory', to: '/inventory', icon: Boxes, group: 'Modules', defaultPlacement: 'header', gate: GATES.inventory },
  { id: 'reservations', label: 'Reservations', to: '/reservations', icon: CalendarDays, group: 'Modules', defaultPlacement: 'header', gate: GATES.reservations },

  // User menu items.
  { id: 'user-settings', label: 'User settings', title: 'User Settings', to: '/settings/user', icon: UserCog, group: 'Settings', defaultPlacement: 'userMenu', searchable: false },
  { id: 'my-profile', label: 'My Profile', to: '/me', icon: IdCard, group: 'Settings', defaultPlacement: 'userMenu', needsEmployee: true, searchable: false },
  { id: 'settings', label: 'General settings', title: 'General Settings', to: '/settings', icon: Settings, group: 'Settings', defaultPlacement: 'userMenu', gate: GATES.settings },
  { id: 'roadmap', label: 'Roadmap', to: '/roadmap', icon: MapIcon, group: 'Settings', defaultPlacement: 'userMenu' },
  { id: 'import', label: 'Import Workbooks', to: '/data/import', icon: FileSpreadsheet, group: 'Settings', defaultPlacement: 'userMenu', gate: GATES.import },
  { id: 'tally', label: 'Tally Integration', to: '/data/tally', icon: Cable, group: 'Settings', defaultPlacement: 'userMenu', gate: GATES.tally },
  { id: 'cost-centres', label: 'Cost Centres', to: '/settings/cost-centres', icon: Layers, group: 'Settings', defaultPlacement: 'userMenu', gate: GATES.costCentres },
  { id: 'users', label: 'Users and Permissions', to: '/settings/users', icon: Users, group: 'Settings', defaultPlacement: 'userMenu', gate: GATES.users },
];

const TITLES = new Map(NAV_ITEMS.map((item) => [item.to, item.title ?? item.label]));

/** Header title for a path, or null when the path isn't a nav destination. */
export function navTitle(pathname: string): string | null {
  return TITLES.get(pathname) ?? null;
}
