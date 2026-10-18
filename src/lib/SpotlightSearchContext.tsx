// Owns SpotlightSearch's (src/components/SpotlightSearch.tsx) open state so
// header buttons elsewhere in the tree can open the palette without prop
// drilling - see SpotlightSearchButton.tsx. Mounted once in src/App.tsx,
// inside AuthenticatedApp, wrapping the route tree.
import React, { createContext, useContext, useState, type ReactNode } from 'react';
import SpotlightSearch from '@/components/SpotlightSearch';

interface SpotlightSearchContextValue {
  openSearch: () => void;
}

const SpotlightSearchContext = createContext<SpotlightSearchContextValue | undefined>(undefined);

export function useSpotlightSearch(): SpotlightSearchContextValue {
  const ctx = useContext(SpotlightSearchContext);
  if (!ctx) throw new Error('useSpotlightSearch must be used within a SpotlightSearchProvider');
  return ctx;
}

export function SpotlightSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <SpotlightSearchContext.Provider value={{ openSearch: () => setOpen(true) }}>
      {children}
      <SpotlightSearch open={open} onOpenChange={setOpen} />
    </SpotlightSearchContext.Provider>
  );
}
