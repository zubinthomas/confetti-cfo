// The data-driven dashboard route tree. This module (and everything it
// imports, including the src/data adapters) lives in a lazy chunk that
// DatasetGate only imports after /api/dataset has been fetched - the adapters
// compute their aggregates at module-evaluation time and need the dataset
// present. Keep any import of "@/data/*" inside this chunk.
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import DashboardShell from '@/components/dashboard/DashboardShell';
import OverviewTab from '@/components/dashboard/OverviewTab';
import SienaTab from '@/components/dashboard/SienaTab';
import StoreTab from '@/components/dashboard/StoreTab';
import CashFlowTab from '@/components/dashboard/CashFlowTab';
import AIQueriesTab from '@/components/dashboard/AIQueriesTab';
import CraftDeptPage from '@/components/dashboard/CraftDeptPage';
import ConsignmentPage from '@/components/dashboard/ConsignmentPage';
import OpsPage from '@/components/dashboard/OpsPage';
import ImportPage from '@/components/dashboard/ImportPage';
import SettingsPage from '@/components/dashboard/SettingsPage';
import CafePage from '@/components/fnb/CafePage';
import RestaurantPage from '@/components/fnb/RestaurantPage';
import BarPage from '@/components/fnb/BarPage';
import EventsPage from '@/components/fnb/EventsPage';
import RannaghorPage from '@/components/fnb/RannaghorPage';
import { POTTERY, BATIK, STITCHING, TRADING_ITEMS } from '@/data/ceplData';

export default function DashboardApp() {
  return (
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
        <Route path="crafts/pottery" element={<CraftDeptPage data={POTTERY} heading="Pottery Division" />} />
        <Route path="crafts/batik" element={<CraftDeptPage data={BATIK} heading="Batik Division" />} />
        <Route path="crafts/stitching" element={<CraftDeptPage data={STITCHING} heading="Stitching Division" />} />
        <Route path="crafts/trading-items" element={<CraftDeptPage data={TRADING_ITEMS} heading="Trading Items" />} />
        <Route path="cashflow" element={<CashFlowTab />} />
        <Route path="ai" element={<AIQueriesTab />} />
        <Route path="data/import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="ops/:section" element={<OpsPage />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}
