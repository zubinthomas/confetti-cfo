// Global Cmd/Ctrl+K command palette. Built directly on Dialog + Command
// (src/components/ui/dialog.jsx, src/components/ui/command.jsx) rather than
// command.jsx's CommandDialog convenience wrapper - CommandDialog spreads
// its extra props onto <Dialog>, not onto the inner <Command>, so there's
// no way to get `shouldFilter={false}` through it to Command. That flag
// matters here specifically: this palette mixes two result sources (instant
// client-side matches and a debounced network fetch) under one query
// string, and cmdk's own default fuzzy filter would re-filter both against
// whatever the *current* input value is, fighting the manual filtering
// below. Mounted once in src/App.tsx, inside AuthenticatedApp.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '@/components/ui/command';
import { useAuth } from '@/lib/AuthContext';
import { useReferenceData } from '@/hooks/useReferenceData';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearch } from '@/hooks/useSearch';
import {
  SPOTLIGHT_PAGES, pageIsVisible, BUSINESS_UNIT_ROUTES, BUSINESS_UNIT_FALLBACK_ROUTE, TAXONOMY_ROUTES,
} from '@/lib/spotlightConfig';

const RESULT_CAP = 6;

function matches(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.toLowerCase());
}

function filterByName<T extends { name: string }>(items: T[] | undefined, query: string): T[] {
  if (!items) return [];
  return items.filter((i) => matches(i.name, query)).slice(0, RESULT_CAP);
}

// `open`/`onOpenChange` are owned by SpotlightSearchProvider
// (src/lib/SpotlightSearchContext.tsx) so a header button elsewhere in the
// tree can open the palette via useSpotlightSearch() without prop-drilling.
export default function SpotlightSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { isAuthenticated, can } = useAuth();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  // Mirrors src/components/ui/sidebar.jsx's own Cmd/Ctrl+B listener exactly
  // (same event-key check, same preventDefault, same mount/cleanup shape).
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, open, onOpenChange]);

  const { data: reference } = useReferenceData();
  const debouncedQuery = useDebouncedValue(query, 200);
  const { data: results, isFetching } = useSearch(debouncedQuery);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const showNetworkLoading = isFetching && debouncedQuery.trim().length >= 2;

  const pageMatches = useMemo(
    () => (hasQuery ? SPOTLIGHT_PAGES.filter((p) => pageIsVisible(p, can) && matches(p.label, trimmed)).slice(0, RESULT_CAP) : []),
    [hasQuery, trimmed, can]
  );

  const businessUnits = useMemo(() => (hasQuery ? filterByName(reference?.businessUnits, trimmed) : []), [hasQuery, reference, trimmed]);
  const vendors = useMemo(() => (hasQuery ? filterByName(reference?.vendors, trimmed) : []), [hasQuery, reference, trimmed]);
  const categories = useMemo(() => (hasQuery ? filterByName(reference?.categories, trimmed) : []), [hasQuery, reference, trimmed]);
  const channels = useMemo(() => (hasQuery ? filterByName(reference?.channels, trimmed) : []), [hasQuery, reference, trimmed]);
  const costCentres = useMemo(() => (hasQuery ? filterByName(reference?.costCentres, trimmed) : []), [hasQuery, reference, trimmed]);
  const lineItems = useMemo(() => (hasQuery ? filterByName(reference?.lineItems, trimmed) : []), [hasQuery, reference, trimmed]);

  function go(to: string) {
    onOpenChange(false);
    setQuery('');
    navigate(to);
  }

  if (!isAuthenticated) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, business units, employees, outstanding bills, reservations, and roadmap items
        </DialogDescription>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput placeholder="Search pages, business units, employees, bills, reservations…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{hasQuery ? 'No results found.' : 'Start typing to search.'}</CommandEmpty>

            {pageMatches.length > 0 && (
              <CommandGroup heading="Pages">
                {pageMatches.map((p) => (
                  <CommandItem key={p.to} value={`page-${p.to}`} onSelect={() => go(p.to)}>{p.label}</CommandItem>
                ))}
              </CommandGroup>
            )}

            {businessUnits.length > 0 && (
              <CommandGroup heading="Business Units">
                {businessUnits.map((u) => (
                  <CommandItem key={`bu-${u.id}`} value={`bu-${u.id}`} onSelect={() => go(BUSINESS_UNIT_ROUTES[u.name] ?? BUSINESS_UNIT_FALLBACK_ROUTE)}>
                    {u.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {vendors.length > 0 && (
              <CommandGroup heading="Vendors">
                {vendors.map((v) => (
                  <CommandItem key={`vendor-${v.id}`} value={`vendor-${v.id}`} onSelect={() => go(TAXONOMY_ROUTES.vendor)}>{v.name}</CommandItem>
                ))}
              </CommandGroup>
            )}

            {categories.length > 0 && (
              <CommandGroup heading="Categories">
                {categories.map((c) => (
                  <CommandItem key={`category-${c.id}`} value={`category-${c.id}`} onSelect={() => go(TAXONOMY_ROUTES.category)}>{c.name}</CommandItem>
                ))}
              </CommandGroup>
            )}

            {channels.length > 0 && (
              <CommandGroup heading="Channels">
                {channels.map((c) => (
                  <CommandItem key={`channel-${c.id}`} value={`channel-${c.id}`} onSelect={() => go(TAXONOMY_ROUTES.channel)}>{c.name}</CommandItem>
                ))}
              </CommandGroup>
            )}

            {costCentres.length > 0 && (
              <CommandGroup heading="Cost Centres">
                {costCentres.map((c) => (
                  <CommandItem key={`cc-${c.id}`} value={`cc-${c.id}`} onSelect={() => go(TAXONOMY_ROUTES.costCentre)}>{c.name}</CommandItem>
                ))}
              </CommandGroup>
            )}

            {lineItems.length > 0 && (
              <CommandGroup heading="Line Items">
                {lineItems.map((l) => (
                  <CommandItem key={`li-${l.id}`} value={`li-${l.id}`} onSelect={() => go(TAXONOMY_ROUTES.lineItem)}>{l.name}</CommandItem>
                ))}
              </CommandGroup>
            )}

            {results && results.employees.length > 0 && (
              <CommandGroup heading="Employees">
                {results.employees.map((hit) => (
                  <CommandItem key={`emp-${hit.id}`} value={`emp-${hit.id}`} onSelect={() => go('/hr')}>
                    <div className="flex flex-col">
                      <span>{hit.title}</span>
                      {hit.subtitle && <span className="text-xs text-muted-foreground">{hit.subtitle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results && results.bills.length > 0 && (
              <CommandGroup heading="Outstanding Bills">
                {results.bills.map((hit) => (
                  <CommandItem key={`bill-${hit.id}`} value={`bill-${hit.id}`} onSelect={() => go('/cashflow')}>
                    <div className="flex flex-col">
                      <span>{hit.title}</span>
                      {hit.subtitle && <span className="text-xs text-muted-foreground">{hit.subtitle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results && results.reservations.length > 0 && (
              <CommandGroup heading="Reservations">
                {results.reservations.map((hit) => (
                  <CommandItem key={`res-${hit.id}`} value={`res-${hit.id}`} onSelect={() => go('/reservations')}>
                    <div className="flex flex-col">
                      <span>{hit.title}</span>
                      {hit.subtitle && <span className="text-xs text-muted-foreground">{hit.subtitle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results && results.roadmap.length > 0 && (
              <CommandGroup heading="Roadmap">
                {results.roadmap.map((hit) => (
                  <CommandItem key={`road-${hit.id}`} value={`road-${hit.id}`} onSelect={() => go('/roadmap')}>
                    <div className="flex flex-col">
                      <span>{hit.title}</span>
                      {hit.subtitle && <span className="text-xs text-muted-foreground">{hit.subtitle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {showNetworkLoading && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching employees, bills, reservations, roadmap…
              </div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
