import React, { useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, UtensilsCrossed, Coffee, Soup, Wine, PartyPopper, CookingPot,
  Store, Handshake, Factory, Paintbrush, Scissors, Package, Banknote, Sparkles,
  ClipboardList, ShieldAlert, Flame, HardHat, Truck, Users, ShieldCheck, LogOut, FileSpreadsheet,
  MenuIcon, X,
} from "lucide-react";
import { auth } from "@/api/auth";

const NAV_SECTIONS = [
  {
    title: null,
    items: [{ to: "/", label: "Overview", icon: LayoutDashboard, end: true }],
  },
  {
    title: "F&B",
    items: [
      { to: "/fnb", label: "F&B P&L", icon: UtensilsCrossed, end: true },
      { to: "/fnb/cafe", label: "Cafe", icon: Coffee },
      { to: "/fnb/restaurant", label: "Restaurant", icon: Soup },
      { to: "/fnb/bar", label: "Bar", icon: Wine },
      { to: "/fnb/events", label: "Events", icon: PartyPopper },
      { to: "/fnb/rannaghor", label: "Rannaghor", icon: CookingPot },
    ],
  },
  {
    title: "Retail",
    items: [
      { to: "/store", label: "Store P&L", icon: Store, end: true },
      { to: "/store/consignment", label: "Consignment", icon: Handshake },
    ],
  },
  {
    title: "Non-F&B",
    items: [
      { to: "/crafts/pottery", label: "Pottery", icon: Factory },
      { to: "/crafts/batik", label: "Batik", icon: Paintbrush },
      { to: "/crafts/stitching", label: "Stitching", icon: Scissors },
      { to: "/crafts/trading-items", label: "Trading Items", icon: Package },
    ],
  },
  {
    title: "Finance",
    items: [
      { to: "/cashflow", label: "Cash Flow", icon: Banknote },
      { to: "/ai", label: "AI Queries", icon: Sparkles },
    ],
  },
  {
    title: "Data",
    items: [
      { to: "/data/import", label: "Import Workbooks", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/ops/production", label: "Daily Production", icon: ClipboardList },
      { to: "/ops/quality", label: "Rejection & QC", icon: ShieldAlert },
      { to: "/ops/kiln-energy", label: "Kiln & Energy", icon: Flame },
      { to: "/ops/labour", label: "Labour Efficiency", icon: HardHat },
      { to: "/ops/orders", label: "Orders & Dispatch", icon: Truck },
    ],
  },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {NAV_SECTIONS.map((section, i) => (
        <div key={section.title || i}>
          {section.title && (
            <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              {section.title}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
      <div className="pt-3 border-t border-border space-y-0.5">
        <Link
          to="/hr"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Users className="w-4 h-4 shrink-0" /> HR Module
        </Link>
        <Link
          to="/compliance"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ShieldCheck className="w-4 h-4 shrink-0" /> Compliance
        </Link>
        <button
          onClick={() => auth.logout("/")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" /> Sign out
        </button>
      </div>
    </nav>
  );
}

// Current-page title from the nav config, for the header
function pageTitle(pathname: string) {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.to === pathname) return item.label;
    }
  }
  return null;
}

export default function DashboardShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const title = pageTitle(pathname);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-border bg-card">
        <div className="px-6 py-5 border-b border-border">
          <h1 className="text-lg font-bold font-heading text-foreground tracking-tight">
            Confetti Exports
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">CFO Dashboard · FY 2025-26</p>
        </div>
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-card border-r border-border shadow-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold font-heading text-foreground">Confetti Exports</h1>
                <p className="text-[11px] text-muted-foreground">CFO Dashboard · FY 2025-26</p>
              </div>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
          <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
            <button
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-semibold font-heading text-foreground leading-tight">
                {title || "Confetti Exports"}
              </h2>
              <p className="text-[11px] text-muted-foreground">Sienna · CFO Dashboard</p>
            </div>
          </div>
        </header>
        <main className="px-4 sm:px-6 py-6 max-w-7xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
