// The data-driven dashboard route tree. Lives in a lazy chunk that
// ReferenceDataGate (src/App.tsx) only imports after the small reference/
// dimension tables have been fetched. Each page fetches its own filtered
// financial data via hooks (see src/hooks/useFinancialRecords.ts et al.)
// once mounted - visiting one route doesn't pull in every other page's data.
//
// Pages themselves are NOT individually code-split (aside from AIQueriesTab/
// ImportPage below) - they're all part of this one chunk, so navigation
// between them is JS-instant with no extra network round trip. Splitting
// every page into its own chunk was tried and reverted: it turned every
// first visit to a route into a chunk-download-then-fetch waterfall, which
// felt like paying the old "one big load" cost on almost every navigation.
import React, { lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import RequirePermission from '@/components/RequirePermission';
import DashboardShell from '@/components/dashboard/DashboardShell';
import OverviewTab from '@/components/dashboard/OverviewTab';
import SienaTab from '@/components/dashboard/SienaTab';
import StoreTab from '@/components/dashboard/StoreTab';
import CashFlowTab from '@/components/dashboard/CashFlowTab';
import CraftDeptPage from '@/components/dashboard/CraftDeptPage';
import ConsignmentPage from '@/components/dashboard/ConsignmentPage';
import OpsPage from '@/components/dashboard/OpsPage';
import SettingsPage from '@/components/dashboard/SettingsPage';
import UserSettingsPage from '@/components/dashboard/UserSettingsPage';
import UsersPage from '@/components/dashboard/UsersPage';
import CafePage from '@/components/fnb/CafePage';
import RestaurantPage from '@/components/fnb/RestaurantPage';
import BarPage from '@/components/fnb/BarPage';
import EventsPage from '@/components/fnb/EventsPage';
import RannaghorPage from '@/components/fnb/RannaghorPage';

// Kept as separate chunks - AIQueriesTab pulls in react-markdown (~125KB) and
// ImportPage is the next-largest page (~24KB); both are visited far less
// often than the rest of the dashboard. Prefetched below once idle so the
// chunk is normally already warm by the time either is clicked into.
const AIQueriesTab = lazy(() => import('@/components/dashboard/AIQueriesTab'));
const ImportPage = lazy(() => import('@/components/dashboard/ImportPage'));

export default function DashboardApp() {
  useEffect(() => {
    const prefetch = () => {
      import('@/components/dashboard/AIQueriesTab');
      import('@/components/dashboard/ImportPage');
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch);
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []);

  return (
    <Routes>
      <Route element={<DashboardShell />}>
        <Route element={<RequirePermission requires={[{ resource: 'FinancialRecord', action: 'read' }]} />}>
          <Route index element={<OverviewTab />} />
          <Route path="fnb" element={<SienaTab />} />
          <Route path="fnb/cafe" element={<CafePage />} />
          <Route path="fnb/restaurant" element={<RestaurantPage />} />
          <Route path="fnb/bar" element={<BarPage />} />
          <Route path="fnb/events" element={<EventsPage />} />
          <Route path="fnb/rannaghor" element={<RannaghorPage />} />
          <Route path="crafts/pottery" element={<CraftDeptPage deptKey="pottery" heading="Pottery Division" />} />
          <Route path="crafts/batik" element={<CraftDeptPage deptKey="batik" heading="Batik Division" />} />
          <Route path="crafts/stitching" element={<CraftDeptPage deptKey="stitching" heading="Stitching Division" />} />
          <Route path="crafts/trading-items" element={<CraftDeptPage deptKey="tradingItems" heading="Trading Items" />} />
          <Route path="cashflow" element={<CashFlowTab />} />
        </Route>

        <Route element={<RequirePermission mode="all" requires={[
          { resource: 'FinancialRecord', action: 'read' },
          { resource: 'SalesRecord', action: 'read' },
        ]} />}>
          <Route path="store" element={<StoreTab />} />
        </Route>

        <Route element={<RequirePermission requires={[{ resource: 'ConsignmentRecord', action: 'read' }]} />}>
          <Route path="store/consignment" element={<ConsignmentPage />} />
        </Route>

        <Route element={<RequirePermission requires={[{ resource: 'Integration', action: 'read' }]} />}>
          <Route path="ai" element={<AIQueriesTab />} />
        </Route>

        <Route element={<RequirePermission mode="any" requires={[
          { resource: 'Import', action: 'read' },
          { resource: 'SheetSource', action: 'read' },
        ]} />}>
          <Route path="data/import" element={<ImportPage />} />
        </Route>

        <Route element={<RequirePermission requires={[{ resource: 'Settings', action: 'read' }]} />}>
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route element={<RequirePermission mode="any" requires={[{ resource: 'User', action: 'read' }, { resource: 'Invite', action: 'read' }]} />}>
          <Route path="settings/users" element={<UsersPage />} />
        </Route>

        {/* No backend resource is read on this page - open to any authenticated user */}
        <Route path="settings/user" element={<UserSettingsPage />} />

        <Route element={<RequirePermission requires={[{ resource: 'Operations', action: 'read' }]} />}>
          <Route path="ops/:section" element={<OpsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}
