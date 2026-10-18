// Spotlight search (src/components/SpotlightSearch.tsx) - thin wrapper
// around GET /api/search, same convention as every other api/*.ts file.
import { get } from "./http";

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
}

export interface SearchResults {
  employees: SearchHit[];
  bills: SearchHit[];
  reservations: SearchHit[];
  roadmap: SearchHit[];
}

export const search = (q: string) => get<SearchResults>(`/search?q=${encodeURIComponent(q)}`);
