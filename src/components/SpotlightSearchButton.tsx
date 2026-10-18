// Header search icon - opens the global spotlight palette
// (src/components/SpotlightSearch.tsx) via SpotlightSearchContext. Dropped
// into DashboardShell's header plus the standalone page headers (HR,
// Compliance, Inventory, Reservations, MyProfile) that sit outside
// DashboardShell, so Cmd/Ctrl+K always has a visible, tappable equivalent.
import React from 'react';
import { Search } from 'lucide-react';
import { useSpotlightSearch } from '@/lib/SpotlightSearchContext';

export default function SpotlightSearchButton({
  className = '',
  showHint = false,
}: {
  className?: string;
  showHint?: boolean;
}) {
  const { openSearch } = useSpotlightSearch();

  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Search"
      className={`flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <Search className="w-4 h-4 shrink-0" />
      {showHint && (
        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border text-[10px] font-mono text-muted-foreground/70">
          ⌘K
        </kbd>
      )}
    </button>
  );
}
