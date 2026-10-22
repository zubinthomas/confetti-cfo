import React, { Suspense, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import PageSpinner from "./PageSpinner";
import { MenuIcon, X, Plus, LayoutTemplate } from "lucide-react";
import UserMenu from "./UserMenu";
import InstallBanner from "./InstallBanner";
import SpotlightSearchButton from "@/components/SpotlightSearchButton";
import { useCompactNav, useNav } from "@/lib/layout/useNav";
import { navTitle } from "@/lib/layout/registry";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useNav();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {nav.sidebar.map((section, i) => (
        <div key={section.group || i}>
          {section.group && (
            <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              {section.group}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map(({ id, to, label, icon: Icon, end }) => (
              <NavLink
                key={id}
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
      {/* Header links collapse into the drawer on small screens */}
      {nav.header.length > 0 && (
        <div className="pt-3 border-t border-border space-y-0.5">
          {nav.header.map(({ id, to, label, icon: Icon }) => (
            <Link
              key={id}
              to={to}
              onClick={onNavigate}
              className="md:hidden flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Icon className="w-4 h-4 shrink-0" /> {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

export default function DashboardShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const nav = useNav();
  // One place to go (or none): no sidebar, drawer, top-bar links or shortcut,
  // just the page and the user menu.
  const compact = useCompactNav();
  const title = navTitle(pathname);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Desktop sidebar */}
      {!compact && <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-border bg-card">
        <div className="px-6 py-5 border-b border-border">
          <h1 className="text-lg font-bold font-heading text-foreground tracking-tight">
            Confetti Exports
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">CFO Dashboard</p>
        </div>
        <SidebarNav />
      </aside>}

      {/* Mobile drawer */}
      {!compact && mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-card border-r border-border shadow-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold font-heading text-foreground">Confetti Exports</h1>
                <p className="text-[11px] text-muted-foreground">CFO Dashboard</p>
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
            {!compact && (
              <button
                className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ml-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <MenuIcon className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold font-heading text-foreground leading-tight">
                {title || "Confetti Exports"}
              </h2>
              <p className="text-[11px] text-muted-foreground">Sienna · CFO Dashboard</p>
            </div>
            <div className="flex items-center gap-4 ml-auto">
              {pathname === "/" && (
                <Link
                  to="/settings/user?section=widgets"
                  aria-label="Edit layout"
                  className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors max-sm:w-10 max-sm:h-10"
                >
                  <LayoutTemplate className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Edit layout</span>
                </Link>
              )}
              <SpotlightSearchButton showHint />
              {!compact && <div className="hidden md:flex items-center gap-4">
                {nav.header.map(({ id, to, label, icon: Icon }) => (
                  <Link
                    key={id}
                    to={to}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon className="w-4 h-4 shrink-0" /> {label}
                  </Link>
                ))}
              </div>}
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="px-4 sm:px-6 py-6 max-w-7xl">
          {/* Only AIQueriesTab/ImportPage are still lazy-loaded (see
              DashboardApp.tsx) - this boundary keeps the sidebar/header
              mounted during their chunk load instead of blanking the whole
              viewport. */}
          <InstallBanner />
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile-only shortcut to Import Workbooks */}
      {!compact && <Link
        to="/data/import"
        aria-label="Import Workbooks"
        className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <Plus className="w-6 h-6" />
      </Link>}
    </div>
  );
}
