// ⚠️  AUTH DISABLED FOR PROTOTYPING — always authenticated as dev user
import React, { createContext, useContext } from 'react';

const AuthContext = createContext();

const DEV_USER = { id: 'dev-user', email: 'dev@local', full_name: 'Dev User' };

export const AuthProvider = ({ children }) => (
  <AuthContext.Provider value={{
    user: DEV_USER,
    isAuthenticated: true,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authError: null,
    appPublicSettings: null,
    authChecked: true,
    logout: () => {},
    navigateToLogin: () => {},
    checkUserAuth: async () => {},
    checkAppState: async () => {},
  }}>
    {children}
  </AuthContext.Provider>
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
