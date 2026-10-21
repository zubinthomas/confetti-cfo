// Shared types for the layout registry and resolver. Type-only imports, so
// resolve.ts and its tests never pull in React or icon code.
import type { PermissionAction } from '@/lib/AuthContext';

export interface Requirement {
  resource: string;
  action: PermissionAction;
}

/** The same shape RequirePermission takes. `mode` defaults to 'all'. */
export interface Gate {
  requires: Requirement[];
  mode?: 'all' | 'any';
}

export type CanFn = (resource: string, action: PermissionAction) => boolean;

export const PLACEMENTS = ['sidebar', 'header', 'userMenu'] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Registry ids are a stable contract: stored layouts refer to them, so never
 *  rename one without migrating the stored data. */
export interface NavItemBase {
  id: string;
  /** Text in menus and links. */
  label: string;
  /** Page header and search label when it differs from `label`. */
  title?: string;
  to: string;
  /** Sidebar section title. null = untitled section at the top. */
  group: string | null;
  defaultPlacement: Placement;
  /** Omitted = open to any authenticated user. */
  gate?: Gate;
  /** NavLink `end` matching, for index-style routes. */
  end?: boolean;
  /** Only shown to users linked to an employee record (/me). */
  needsEmployee?: boolean;
  /** false = left out of spotlight search. */
  searchable?: boolean;
}

export type WidgetWidth = 'sixth' | 'third' | 'half' | 'full';

/** One layer of layout overrides. Sparse: anything missing falls through to
 *  the layer below. Mirrors the server's StoredLayout (server/db/layouts.ts).
 *  Only `nav` is resolved so far; tabs and widgets arrive with their own
 *  phases. */
export interface LayoutConfig {
  v: 1;
  nav?: {
    items?: Record<string, { hidden?: boolean; placement?: Placement }>;
    order?: Partial<Record<Placement, string[]>>;
  };
  tabs?: Record<string, { hidden?: string[]; order?: string[]; default?: string }>;
  widgets?: Record<string, { hidden?: string[]; order?: string[]; width?: Record<string, WidgetWidth> }>;
}

/** What GET /auth/me returns: the layers that apply to this user, each list
 *  already in application order (the layer that should lose comes first). */
export interface LayoutLayers {
  permission: { key: string; priority: number; config: LayoutConfig }[];
  roles: { roleId: number; rank: number; config: LayoutConfig }[];
  user: LayoutConfig | null;
}
