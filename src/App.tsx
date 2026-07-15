import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import HR from '@/pages/HR';
import Compliance from '@/pages/Compliance';
import { get } from '@/api/http';
import { setDataset, type Dataset } from '@/data/datasetStore';
import PageNotFound from '@/lib/PageNotFound';

// The dashboard (and the data adapters it imports) loads only after the
// dataset has been fetched - see the note in src/data/datasetStore.ts.
const DashboardApp = lazy(() => import('./DashboardApp'));

const Splash = ({ message }: { message?: string }) => (
  <div className="fixed inset-0 flex flex-col items-center justify-center gap-3">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    {message && <p className="text-sm text-muted-foreground">{message}</p>}
  </div>
);

/** Fetches the dataset from the API, then mounts the dashboard chunk. */
const DatasetGate = () => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState('loading');
    get<Dataset>('/dataset')
      .then((d) => {
        setDataset(d);
        setState('ready');
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load the dataset');
        setState('error');
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state === 'loading') return <Splash message="Loading financial data…" />;
  if (state === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-foreground font-medium">Couldn&rsquo;t load the financial dataset</p>
        <p className="text-sm text-muted-foreground max-w-md">
          {error}. Make sure the API server is running (and seeded - <code>npm run db:seed</code> in <code>server/</code>).
        </p>
        <button
          onClick={load}
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

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <Splash />;
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
      {/* registration is disabled - users are created via the CLI (see README) */}
      <Route path="/register" element={<PageNotFound />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/hr" element={<HR />} />
        <Route path="/compliance" element={<Compliance />} />
        {/* Everything else is the data-driven dashboard (it 404s unknown paths itself) */}
        <Route path="/*" element={<DatasetGate />} />
      </Route>
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
