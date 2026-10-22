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
  CalendarOff, UserSearch, FileCheck, UserPlus, Shield, DoorOpen, Settings2, LayoutTemplate,
} from 'lucide-react';
import type { Gate, NavItemBase, TabBase, WidgetBase } from './types';

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
  users: { mode: 'any', requires: [read('User'), read('Invite'), read('Role'), read('Layout')] },
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

export interface TabItem extends TabBase {
  icon?: LucideIcon;
}

export type PageId = 'hr' | 'users' | 'reservations' | 'store' | 'fnb-view' | 'fnb-detail';

/** Names for the layout editor's page list. */
export const PAGE_LABELS: Record<PageId, string> = {
  hr: 'HR',
  users: 'Users and roles',
  reservations: 'Reservations',
  store: 'Store P&L',
  'fnb-view': 'F&B P&L views',
  'fnb-detail': 'F&B detail',
};

const needs = (resource: string): Gate => ({ requires: [read(resource)] });

/** Tabs and view switchers per page, in default order. Gates are what each
 *  tab actually reads from the API, so a tab never opens onto a 403. The
 *  pages that conditionally show a switcher (F&B detail, only when venue data
 *  exists) keep that condition themselves; this only decides which tabs
 *  exist, their order and which one opens first. */
export const PAGE_TABS: Record<PageId, TabItem[]> = {
  hr: [
    { id: 'headcount', label: 'Headcount & Payroll', icon: Users, gate: needs('Employee') },
    { id: 'leave', label: 'Leave & Attendance', icon: CalendarOff, gate: needs('LeaveRequest') },
    { id: 'roster', label: 'Roster', icon: CalendarDays, gate: needs('Employee') },
    { id: 'recruitment', label: 'Recruitment', icon: UserSearch, gate: needs('Recruitment') },
    { id: 'documents', label: 'Documents', icon: FileCheck, gate: needs('Employee') },
  ],
  users: [
    { id: 'users', label: 'Users', icon: Users, gate: needs('User') },
    { id: 'invites', label: 'Invited Users', icon: UserPlus, gate: needs('Invite') },
    { id: 'roles', label: 'Roles', icon: Shield, gate: needs('Role') },
    { id: 'layouts', label: 'Layouts', icon: LayoutTemplate, gate: needs('Layout') },
  ],
  reservations: [
    { id: 'signin', label: 'Guest Register', icon: DoorOpen },
    { id: 'day', label: 'Reservations', icon: CalendarDays },
    { id: 'manage', label: 'Locations & Tables', icon: Settings2 },
  ],
  store: [
    { id: 'channels', label: 'Channel Mix' },
    { id: 'categories', label: 'Categories' },
    { id: 'yoy', label: 'YoY Comparison' },
    { id: 'costs', label: 'Cost Structure' },
  ],
  'fnb-view': [
    { id: 'revenue', label: 'Revenue Mix' },
    { id: 'margins', label: 'Margin Trends' },
    { id: 'pl', label: 'Net P&L' },
    { id: 'costs', label: 'Cost Breakdown' },
  ],
  'fnb-detail': [
    { id: 'targets', label: 'Targets' },
    { id: 'venue', label: 'By Venue' },
    { id: 'item', label: 'By Item' },
  ],
};

// ── Overview widgets ─────────────────────────────────────────────────────────
// Metadata only. The components live in src/components/overview/ and are keyed
// by these ids; a test checks the two lists stay in step. Order here is the
// default order. Ids are stored in layouts, never rename one without migrating.

/** Which data provider a widget reads from. Providers mount only when a
 *  visible widget needs them, so hidden widgets cost no requests. */
export type OverviewSource = 'group' | 'leadership';

export interface OverviewWidget extends WidgetBase {
  source: OverviewSource;
  /** header and kpi render bare; card and text get the spacing of a section. */
  kind: 'header' | 'kpi' | 'card' | 'text';
}

export const OVERVIEW_AREA = 'overview';

// Gates follow what each widget reads from the API. Nearly everything is
// FinancialRecord:read (KPIs, charts, company P&L, balance sheet, cash flow and
// targets all come from financial records). The FY 26-27 targets card also
// reads sales records, so it takes the store gate. Import:read (the "imported
// on" badges) and ExceptionAssignment:read (assignment blocks) are optional
// extras inside a widget and are checked there, not here.
const group = (
  id: string, label: string, kind: OverviewWidget['kind'], defaultWidth: OverviewWidget['defaultWidth'],
  gate: Gate = GATES.financial,
): OverviewWidget => ({ id: `group.${id}`, label, kind, defaultWidth, source: 'group', section: 'group', gate });
const leadership = (id: string, label: string, kind: OverviewWidget['kind'], defaultWidth: OverviewWidget['defaultWidth']): OverviewWidget =>
  ({ id: `leadership.${id}`, label, kind, defaultWidth, source: 'leadership', section: 'leadership', gate: GATES.financial, defaultHidden: true });

export const OVERVIEW_WIDGETS: OverviewWidget[] = [
  // Heads the Group section: not hideable, movable or resizable (sectionHeader).
  { ...group('header', 'Group snapshot heading and year picker', 'header', 'full'), sectionHeader: true },
  group('kpi.fnbRevenue', 'F&B revenue (year)', 'kpi', 'sixth'),
  group('kpi.storeRevenue', 'Store revenue (year)', 'kpi', 'sixth'),
  group('kpi.fnbProfit', 'F&B net profit (year)', 'kpi', 'sixth'),
  group('kpi.storePL', 'Store net P&L (year)', 'kpi', 'sixth'),
  group('kpi.fnbLatest', 'F&B revenue (latest month)', 'kpi', 'sixth'),
  group('kpi.storeLatest', 'Store revenue (latest month)', 'kpi', 'sixth'),
  group('targets', 'FY 26-27 targets (Store + F&B)', 'card', 'full', GATES.store),
  group('chart.monthlyRevenue', 'Monthly revenue chart', 'card', 'full'),
  group('chart.monthlyPL', 'Monthly net P&L chart', 'card', 'full'),
  group('chart.annualRevenue', 'Annual revenue chart', 'card', 'full'),
  group('chart.annualPL', 'Annual net P&L chart', 'card', 'full'),
  group('health', 'Performance health check', 'card', 'full'),

  leadership('header', 'Leadership Command Centre heading', 'header', 'full'),
  leadership('kpi.revenue', 'Company revenue (Tally)', 'kpi', 'sixth'),
  leadership('kpi.margin', 'Net margin (Tally)', 'kpi', 'sixth'),
  leadership('kpi.assets', 'Total assets', 'kpi', 'sixth'),
  leadership('kpi.balanceCheck', 'Balance check', 'kpi', 'sixth'),
  leadership('kpi.cashNet', 'Group cash net', 'kpi', 'sixth'),
  leadership('kpi.storeFnbTarget', 'Store + F&B vs target', 'kpi', 'sixth'),
  leadership('interventions', 'Where to intervene', 'card', 'full'),
  leadership('unavailable', 'Not yet available', 'card', 'full'),
  leadership('footnote', 'Data sources note', 'text', 'full'),
];
