import React, { Suspense, lazy } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AccessRestricted from '@/components/AccessRestricted';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import RequirePermission from '@/components/RequirePermission';
import { Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import HR from '@/pages/HR';
import Compliance from '@/pages/Compliance';
import AcceptInvite from '@/pages/AcceptInvite';
import MyProfile from '@/pages/MyProfile';
import InventoryPage from '@/pages/Inventory';
import { useReferenceData } from '@/hooks/useReferenceData';

const DashboardApp = lazy(() => import('./DashboardApp'));

const Splash = ({ message }: { message?: string }) => (
  <div className="fixed inset-0 flex flex-col items-center justify-center gap-3">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    {message && <p className="text-sm text-muted-foreground">{message}</p>}
  </div>
);

/** Fetches the small reference/dimension tables, then mounts the dashboard
 * chunk. Each page fetches its own filtered financial data via hooks (see
 * src/hooks/useFinancialRecords.ts et al.) once mounted. */
const ReferenceDataGate = () => {
  const { isLoading, error, refetch } = useReferenceData();

  if (isLoading) return <Splash message="Loading financial data…" />;
  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-foreground font-medium">Couldn&rsquo;t load the financial dataset</p>
        <p className="text-sm text-muted-foreground max-w-md">
          {error.message}. Make sure the API server is running (and seeded - <code>npm run db:seed</code> in <code>server/</code>).
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <Suspense fallback={<Splash />}>
      <DashboardApp />
    </Suspense>
  );
};

// Routes reachable while logged out - the auth_required redirect below must
// never fire on these, or visiting /login while logged out would redirect to
// /login, re-run the same failed auth check, and redirect again forever.
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();
  const isPublicPath = PUBLIC_PATHS.includes(location.pathname) || location.pathname.startsWith('/invite/');

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <Splash />;
  }

  // Handle authentication errors (not on the public auth pages themselves)
  if (authError && !isPublicPath) {
    if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
    return <AccessRestricted />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* No open registration - accounts are CLI-created or invite-only (see README) */}
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        {/* Coarse "can enter the module at all" gate - each tab inside HR.tsx
            additionally self-checks its own specific permission via can(). */}
        <Route element={<RequirePermission mode="any" requires={[
          { resource: 'Employee', action: 'read' },
          { resource: 'LeaveRequest', action: 'read' },
          { resource: 'Recruitment', action: 'read' },
        ]} />}>
          <Route path="/hr" element={<HR />} />
        </Route>
        <Route element={<RequirePermission requires={[{ resource: 'Licence', action: 'read' }]} />}>
          <Route path="/compliance" element={<Compliance />} />
        </Route>
        <Route element={<RequirePermission requires={[{ resource: 'Inventory', action: 'read' }]} />}>
          <Route path="/inventory" element={<InventoryPage />} />
        </Route>
        {/* Identity-based, not permission-gated - see server/db/employeeSelf.ts.
            Renders its own "not linked" message for anyone who navigates here
            without an employee link. Kept outside ReferenceDataGate below since
            it doesn't need the financial reference-data prerequisite. */}
        <Route path="/me" element={<MyProfile />} />
        {/* Everything else is the data-driven dashboard (it 404s unknown paths itself) */}
        <Route path="/*" element={<ReferenceDataGate />} />
      </Route>
    </Routes>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
