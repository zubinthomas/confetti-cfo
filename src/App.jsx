import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import HR from '@/pages/HR';
import Compliance from '@/pages/Compliance';
import DashboardShell from '@/components/dashboard/DashboardShell';
import OverviewTab from '@/components/dashboard/OverviewTab';
import SienaTab from '@/components/dashboard/SienaTab';
import StoreTab from '@/components/dashboard/StoreTab';
import CashFlowTab from '@/components/dashboard/CashFlowTab';
import AIQueriesTab from '@/components/dashboard/AIQueriesTab';
import CraftDeptPage from '@/components/dashboard/CraftDeptPage';
import ConsignmentPage from '@/components/dashboard/ConsignmentPage';
import OpsPage from '@/components/dashboard/OpsPage';
import CafePage from '@/components/fnb/CafePage';
import RestaurantPage from '@/components/fnb/RestaurantPage';
import BarPage from '@/components/fnb/BarPage';
import EventsPage from '@/components/fnb/EventsPage';
import RannaghorPage from '@/components/fnb/RannaghorPage';
import { POTTERY, BATIK, STITCHING, TRADING_ITEMS } from '@/data/financialData';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<DashboardShell />}>
          <Route path="/" element={<OverviewTab />} />
          <Route path="/fnb" element={<SienaTab />} />
          <Route path="/fnb/cafe" element={<CafePage />} />
          <Route path="/fnb/restaurant" element={<RestaurantPage />} />
          <Route path="/fnb/bar" element={<BarPage />} />
          <Route path="/fnb/events" element={<EventsPage />} />
          <Route path="/fnb/rannaghor" element={<RannaghorPage />} />
          <Route path="/store" element={<StoreTab />} />
          <Route path="/store/consignment" element={<ConsignmentPage />} />
          <Route path="/crafts/pottery" element={<CraftDeptPage data={POTTERY} heading="Pottery Division" />} />
          <Route path="/crafts/batik" element={<CraftDeptPage data={BATIK} heading="Batik Division" />} />
          <Route path="/crafts/stitching" element={<CraftDeptPage data={STITCHING} heading="Stitching Division" />} />
          <Route path="/crafts/trading-items" element={<CraftDeptPage data={TRADING_ITEMS} heading="Trading Items" />} />
          <Route path="/cashflow" element={<CashFlowTab />} />
          <Route path="/ai" element={<AIQueriesTab />} />
          <Route path="/ops/:section" element={<OpsPage />} />
        </Route>
        <Route path="/hr" element={<HR />} />
        <Route path="/compliance" element={<Compliance />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App