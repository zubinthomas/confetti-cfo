// Restaurant module routes (mounted at /api/restaurant): locations, areas, tables, and reservations - see
// server/db/reservations.ts. No public sub-routes, so authMiddleware is
// applied router-wide, matching inventory.ts's/users.ts's convention.
import { Router } from 'express';
import { authMiddleware, requirePermission, requireAnyPermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  ReservationError,
  listLocations, createLocation, updateLocation, archiveLocation, restoreLocation, purgeLocation,
  listAreas, createArea, updateArea, archiveArea, restoreArea, purgeArea,
  listTables, createTable, updateTable, archiveTable, restoreTable, purgeTable,
  type ArchivedFilter,
  listReservations, listReservationPage, createReservation, updateReservationStatus, deleteReservation,
  extendReservation, rescheduleReservation, endReservationEarly,
} from '../db/reservations.ts';
import { TableMergeError, listActiveMerges, createMerge, releaseMerge } from '../db/tableMerges.ts';
import { pushReservationEvent, deleteReservationEvent, claimAppAuthority } from '../calendar/sync.ts';
import type { schema } from '../db/client.ts';

type ReservationRow = typeof schema.reservations.$inferSelect;

// Push after any in-app mutation. Reservations pulled in from Calendar
// start Calendar-authoritative (see schema.ts) - the first in-app edit
// claims app authority before pushing, per the conflict rule in
// server/calendar/sync.ts. Never blocks the response: pushReservationEvent
// itself never throws.
async function syncAfterMutation(row: ReservationRow): Promise<ReservationRow> {
  if (row.calendarAuthoritative) {
    await claimAppAuthority(row.id);
    row = { ...row, calendarAuthoritative: false };
  }
  await pushReservationEvent(row);
  return row;
}

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const archivedParam = (v: unknown): ArchivedFilter => (v === 'include' || v === 'only' ? v : 'exclude');

// The module is split three ways: Restaurant (catalog), Reservation (bookings),
// GuestRegister (sign-ins). Pickers and the floor view serve all of them.
const ANY_READ = [
  { resource: 'Restaurant', action: 'read' },
  { resource: 'Reservation', action: 'read' },
  { resource: 'GuestRegister', action: 'read' },
] as const;
const FLOOR_WRITE = [
  { resource: 'GuestRegister', action: 'write' },
  { resource: 'Reservation', action: 'write' },
] as const;

const status = (err: unknown) => (err instanceof ReservationError || err instanceof TableMergeError ? 400 : 500);

// ── Locations ────────────────────────────────────────────────────────────

router.get('/locations', requireAnyPermission(...ANY_READ), async (req: AuthedRequest, res) => {
  try {
    res.json(await listLocations({ archived: archivedParam(req.query.archived) }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/locations', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name } = req.body ?? {};
    res.status(201).json(await createLocation({ name }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/locations/:id', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name } = req.body ?? {};
    res.json(await updateLocation(req.params.id, { name }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// Archives by default; ?purge=true removes the row for good, but only if it never had any history.
router.delete('/locations/:id', requirePermission('Restaurant', 'delete'), async (req: AuthedRequest, res) => {
  try {
    if (req.query.purge === 'true') {
      await purgeLocation(req.params.id);
      res.json({ message: 'Deleted' });
    } else {
      await archiveLocation(req.params.id);
      res.json({ message: 'Archived' });
    }
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/locations/:id/restore', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    await restoreLocation(req.params.id);
    res.json({ message: 'Restored' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Areas ────────────────────────────────────────────────────────────────

router.get('/areas', requireAnyPermission(...ANY_READ), async (req: AuthedRequest, res) => {
  try {
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
    res.json(await listAreas({ locationId, archived: archivedParam(req.query.archived) }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/areas', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { locationId, name, floor, type } = req.body ?? {};
    if (typeof locationId !== 'string') return res.status(400).json({ message: 'locationId is required' });
    res.status(201).json(await createArea({ locationId, name, floor, type }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/areas/:id', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name, floor, type } = req.body ?? {};
    res.json(await updateArea(req.params.id, { name, floor, type }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// Archives by default; ?purge=true removes the row for good, but only if it never had any history.
router.delete('/areas/:id', requirePermission('Restaurant', 'delete'), async (req: AuthedRequest, res) => {
  try {
    if (req.query.purge === 'true') {
      await purgeArea(req.params.id);
      res.json({ message: 'Deleted' });
    } else {
      await archiveArea(req.params.id);
      res.json({ message: 'Archived' });
    }
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/areas/:id/restore', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    await restoreArea(req.params.id);
    res.json({ message: 'Restored' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Tables ───────────────────────────────────────────────────────────────

router.get('/tables', requireAnyPermission(...ANY_READ), async (req: AuthedRequest, res) => {
  try {
    const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
    res.json(await listTables({ areaId, archived: archivedParam(req.query.archived) }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/tables', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { areaId, name, type, capacity, maxExtraCapacity, freeMerge, mergeableWith } = req.body ?? {};
    if (typeof areaId !== 'string') return res.status(400).json({ message: 'areaId is required' });
    if (typeof capacity !== 'number') return res.status(400).json({ message: 'capacity must be a number' });
    if (maxExtraCapacity !== undefined && typeof maxExtraCapacity !== 'number') {
      return res.status(400).json({ message: 'maxExtraCapacity must be a number' });
    }
    if (freeMerge !== undefined && typeof freeMerge !== 'boolean') {
      return res.status(400).json({ message: 'freeMerge must be a boolean' });
    }
    if (mergeableWith !== undefined
      && (!Array.isArray(mergeableWith) || !mergeableWith.every((x: unknown) => typeof x === 'string'))) {
      return res.status(400).json({ message: 'mergeableWith must be an array of table ids' });
    }
    res.status(201).json(await createTable({ areaId, name, type, capacity, maxExtraCapacity, freeMerge, mergeableWith }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/tables/:id', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name, type, capacity, maxExtraCapacity, freeMerge, mergeableWith } = req.body ?? {};
    if (capacity !== undefined && typeof capacity !== 'number') return res.status(400).json({ message: 'capacity must be a number' });
    if (maxExtraCapacity !== undefined && typeof maxExtraCapacity !== 'number') {
      return res.status(400).json({ message: 'maxExtraCapacity must be a number' });
    }
    if (freeMerge !== undefined && typeof freeMerge !== 'boolean') {
      return res.status(400).json({ message: 'freeMerge must be a boolean' });
    }
    if (mergeableWith !== undefined
      && (!Array.isArray(mergeableWith) || !mergeableWith.every((x: unknown) => typeof x === 'string'))) {
      return res.status(400).json({ message: 'mergeableWith must be an array of table ids' });
    }
    res.json(await updateTable(req.params.id, { name, type, capacity, maxExtraCapacity, freeMerge, mergeableWith }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// Archives by default; ?purge=true removes the row for good, but only if it never had any history.
router.delete('/tables/:id', requirePermission('Restaurant', 'delete'), async (req: AuthedRequest, res) => {
  try {
    if (req.query.purge === 'true') {
      await purgeTable(req.params.id);
      res.json({ message: 'Deleted' });
    } else {
      await archiveTable(req.params.id);
      res.json({ message: 'Archived' });
    }
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/tables/:id/restore', requirePermission('Restaurant', 'write'), async (req: AuthedRequest, res) => {
  try {
    await restoreTable(req.params.id);
    res.json({ message: 'Restored' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Table merges ─────────────────────────────────────────────────────────
// (Defined before the '/:id' reservation routes so the paths never collide.)

router.get('/table-merges', requireAnyPermission(...ANY_READ), async (_req: AuthedRequest, res) => {
  try {
    res.json(await listActiveMerges());
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/table-merges', requireAnyPermission(...FLOOR_WRITE), async (req: AuthedRequest, res) => {
  try {
    const { tableIds, mergeKind, combinedCapacity, bufferMinutes } = req.body ?? {};
    if (!Array.isArray(tableIds) || !tableIds.every((t) => typeof t === 'string')) {
      return res.status(400).json({ message: 'tableIds must be an array of table ids' });
    }
    if (typeof mergeKind !== 'string') return res.status(400).json({ message: 'mergeKind is required' });
    if (combinedCapacity !== undefined && typeof combinedCapacity !== 'number') {
      return res.status(400).json({ message: 'combinedCapacity must be a number' });
    }
    if (bufferMinutes !== undefined && typeof bufferMinutes !== 'number') {
      return res.status(400).json({ message: 'bufferMinutes must be a number' });
    }
    res.status(201).json(await createMerge(req.user!.id, { tableIds, mergeKind, combinedCapacity, bufferMinutes }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/table-merges/:id/release', requireAnyPermission(...FLOOR_WRITE), async (req: AuthedRequest, res) => {
  try {
    const view = await releaseMerge(req.params.id);
    if (!view) return res.status(404).json({ message: 'No merge with that id' });
    res.json(view);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Reservations ─────────────────────────────────────────────────────────

router.get('/', requirePermission('Reservation', 'read'), async (req: AuthedRequest, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const tableId = typeof req.query.tableId === 'string' ? req.query.tableId : undefined;
    const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
    res.json(await listReservations({ date, tableId, areaId }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// Every reservation across all days, filtered and paged (the "All" list). Declared before
// the by-id routes; nothing else answers GET /all.
router.get('/all', requirePermission('Reservation', 'read'), async (req: AuthedRequest, res) => {
  try {
    const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
    const num = (v: unknown) => (typeof v === 'string' && v !== '' ? Number(v) : undefined);
    res.json(await listReservationPage({
      from: str(req.query.from), to: str(req.query.to), status: str(req.query.status),
      areaId: str(req.query.areaId), q: str(req.query.q),
      order: str(req.query.order),
      limit: num(req.query.limit), offset: num(req.query.offset),
    }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { tableId, date, time, durationMinutes, partySize, guestName, guestPhone, guestEmail, notes } = req.body ?? {};
    if (typeof tableId !== 'string') return res.status(400).json({ message: 'tableId is required' });
    if (typeof partySize !== 'number') return res.status(400).json({ message: 'partySize must be a number' });
    const row = await createReservation(req.user!.id, {
      tableId, date, time, durationMinutes, partySize, guestName, guestPhone, guestEmail, notes,
    });
    await pushReservationEvent(row);
    res.status(201).json(row);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/status', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { status: newStatus } = req.body ?? {};
    if (typeof newStatus !== 'string') return res.status(400).json({ message: 'status is required' });
    res.json(await syncAfterMutation(await updateReservationStatus(req.params.id, newStatus)));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/extend', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { durationMinutes } = req.body ?? {};
    if (typeof durationMinutes !== 'number') return res.status(400).json({ message: 'durationMinutes must be a number' });
    res.json(await syncAfterMutation(await extendReservation(req.params.id, { durationMinutes })));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/reschedule', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { date, time, durationMinutes } = req.body ?? {};
    if (durationMinutes !== undefined && typeof durationMinutes !== 'number') {
      return res.status(400).json({ message: 'durationMinutes must be a number' });
    }
    res.json(await syncAfterMutation(await rescheduleReservation(req.params.id, { date, time, durationMinutes })));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/end-early', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    res.json(await syncAfterMutation(await endReservationEarly(req.params.id)));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/:id', requirePermission('Reservation', 'delete'), async (req: AuthedRequest, res) => {
  try {
    const deleted = await deleteReservation(req.params.id);
    if (deleted) await deleteReservationEvent(deleted);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
