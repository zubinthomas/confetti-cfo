// The data-driven dashboard route tree. Lives in a lazy chunk that
// ReferenceDataGate (src/App.tsx) only imports after the small reference/
// dimension tables have been fetched. Every page below is also individually
// lazy-loaded, and each fetches its own filtered financial data via hooks
// (see src/hooks/useFinancialRecords.ts et al.) once mounted - visiting one
// route doesn't pull in every other page's JS or data.
import React, { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import DashboardShell from '@/components/dashboard/DashboardShell';

const OverviewTab = lazy(() => import('@/components/dashboard/OverviewTab'));
const SienaTab = lazy(() => import('@/components/dashboard/SienaTab'));
const StoreTab = lazy(() => import('@/components/dashboard/StoreTab'));
const CashFlowTab = lazy(() => import('@/components/dashboard/CashFlowTab'));
const AIQueriesTab = lazy(() => import('@/components/dashboard/AIQueriesTab'));
const CraftDeptPage = lazy(() => import('@/components/dashboard/CraftDeptPage'));
const ConsignmentPage = lazy(() => import('@/components/dashboard/ConsignmentPage'));
const OpsPage = lazy(() => import('@/components/dashboard/OpsPage'));
const ImportPage = lazy(() => import('@/components/dashboard/ImportPage'));
const SettingsPage = lazy(() => import('@/components/dashboard/SettingsPage'));
const UserSettingsPage = lazy(() => import('@/components/dashboard/UserSettingsPage'));
const CafePage = lazy(() => import('@/components/fnb/CafePage'));
const RestaurantPage = lazy(() => import('@/components/fnb/RestaurantPage'));
const BarPage = lazy(() => import('@/components/fnb/BarPage'));
const EventsPage = lazy(() => import('@/components/fnb/EventsPage'));
const RannaghorPage = lazy(() => import('@/components/fnb/RannaghorPage'));

const RouteFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function DashboardApp() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<DashboardShell />}>
          <Route index element={<OverviewTab />} />
          <Route path="fnb" element={<SienaTab />} />
          <Route path="fnb/cafe" element={<CafePage />} />
          <Route path="fnb/restaurant" element={<RestaurantPage />} />
          <Route path="fnb/bar" element={<BarPage />} />
          <Route path="fnb/events" element={<EventsPage />} />
          <Route path="fnb/rannaghor" element={<RannaghorPage />} />
          <Route path="store" element={<StoreTab />} />
          <Route path="store/consignment" element={<ConsignmentPage />} />
          <Route path="crafts/pottery" element={<CraftDeptPage deptKey="pottery" heading="Pottery Division" />} />
          <Route path="crafts/batik" element={<CraftDeptPage deptKey="batik" heading="Batik Division" />} />
          <Route path="crafts/stitching" element={<CraftDeptPage deptKey="stitching" heading="Stitching Division" />} />
          <Route path="crafts/trading-items" element={<CraftDeptPage deptKey="tradingItems" heading="Trading Items" />} />
          <Route path="cashflow" element={<CashFlowTab />} />
          <Route path="ai" element={<AIQueriesTab />} />
          <Route path="data/import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/user" element={<UserSettingsPage />} />
          <Route path="ops/:section" element={<OpsPage />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
}
