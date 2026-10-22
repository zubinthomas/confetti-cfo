// Spotlight search - aggregates a handful of business-record types into one
// endpoint so the frontend command palette (src/components/SpotlightSearch.tsx)
// can fire a single request per keystroke instead of four. Each record type
// independently checks its own permission before querying: a user missing
// one permission gets an empty array for that type only, never a 403 for
// the whole search - same "narrow the response, don't block it" posture as
// stripSalaryIfUnauthorized in entities.ts.
import { Router } from 'express';
import { authMiddleware, type AuthedRequest } from '../middleware/auth.ts';
import { hasPermission } from '../db/permissions.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { getManagedEmployeeIds } from '../db/managerScope.ts';
import { searchEmployees } from '../db.ts';
import { searchOutstandingBills } from '../db/bills.ts';
import { searchReservations } from '../db/reservations.ts';
import { readRoadmapItems } from './roadmap.ts';

const MIN_QUERY_LENGTH = 2;
const RESULT_CAP = 6;

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
}

export interface SearchResponse {
  employees: SearchHit[];
  bills: SearchHit[];
  reservations: SearchHit[];
  roadmap: SearchHit[];
}

const EMPTY_RESPONSE: SearchResponse = { employees: [], bills: [], reservations: [], roadmap: [] };

const router = Router();
router.use(authMiddleware);

/** GET /api/search?q=... */
router.get('/', async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < MIN_QUERY_LENGTH) return res.json(EMPTY_RESPONSE);

  const userId = req.user!.id;
  const [employees, bills, reservations, roadmap] = await Promise.all([
    searchEmployeesScoped(userId, q),
    searchBillsScoped(userId, q),
    searchReservationsScoped(userId, q),
    Promise.resolve(searchRoadmapItems(q)),
  ]);

  const response: SearchResponse = {
    employees: employees.map((e) => ({
      id: e.id,
      title: e.fullName || e.employeeId || '(unnamed employee)',
      subtitle: [e.role, e.division].filter(Boolean).join(' · ') || undefined,
    })),
    bills: bills.map((b) => ({
      id: b.id,
      title: b.ledgerName,
      subtitle: `${b.nature === 'receivable' ? 'Receivable' : 'Payable'} · ${b.billRef}`,
    })),
    reservations: reservations.map((r) => ({
      id: r.id,
      title: r.guestName || '(no name)',
      subtitle: `${r.date} ${r.time} · party of ${r.partySize}`,
    })),
    roadmap: roadmap.map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: `${i.area} · ${i.status}`,
    })),
  };
  res.json(response);
});

async function searchEmployeesScoped(userId: number, q: string) {
  if (!(await hasPermission(userId, 'Employee', 'read'))) return [];
  const [scope, managedIds] = await Promise.all([getUserDivisionScope(userId), getManagedEmployeeIds(userId)]);
  return searchEmployees(q, scope, managedIds, RESULT_CAP);
}

async function searchBillsScoped(userId: number, q: string) {
  if (!(await hasPermission(userId, 'OutstandingBills', 'read'))) return [];
  return searchOutstandingBills(q, RESULT_CAP);
}

async function searchReservationsScoped(userId: number, q: string) {
  if (!(await hasPermission(userId, 'Reservation', 'read'))) return [];
  return searchReservations(q, RESULT_CAP);
}

function searchRoadmapItems(q: string) {
  const needle = q.toLowerCase();
  return readRoadmapItems()
    .filter((i) => i.title.toLowerCase().includes(needle) || i.area.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle))
    .slice(0, RESULT_CAP);
}

export default router;
