import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth, type User } from '@/api/auth';
import { ApiError } from '@/api/http';
import type { LayoutConfig } from '@/lib/layout/types';

export type PermissionAction = 'read' | 'write' | 'delete';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isLoadingPublicSettings: boolean;
  authError: { type: string } | null;
  appPublicSettings: unknown;
  authChecked: boolean;
  logout: () => void;
  navigateToLogin: () => void;
  checkUserAuth: () => Promise<void>;
  checkAppState: () => Promise<void>;
  can: (resource: string, action: PermissionAction) => boolean;
  /** Swaps this user's own layout layer locally after it was saved or reset
   *  (null = reset), so the nav updates without refetching /auth/me. */
  setOwnLayout: (config: LayoutConfig | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<{ type: string } | null>(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const me = await auth.me();
      setUser(me);
      setAuthError(null);
    } catch (err) {
      setUser(null);
      setAuthError({ type: err instanceof ApiError && err.status === 401 ? 'auth_required' : 'unknown' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const permissionSet = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const can = useCallback(
    (resource: string, action: PermissionAction) => permissionSet.has(`${resource}:${action}`),
    [permissionSet],
  );

  const setOwnLayout = useCallback((config: LayoutConfig | null) => {
    setUser((u) => (u ? { ...u, layout: { ...u.layout, user: config } } : u));
  }, []);

  const logout = useCallback(() => {
    auth.logout('/login');
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked,
      logout,
      navigateToLogin: () => auth.redirectToLogin(),
      checkUserAuth,
      checkAppState: async () => {},
      can,
      setOwnLayout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
