// Reservation management routes: locations, tables, and reservations - see
// server/db/reservations.ts. No public sub-routes, so authMiddleware is
// applied router-wide, matching inventory.ts's/users.ts's convention.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  ReservationError,
  listLocations, createLocation, updateLocation, deleteLocation,
  listTables, createTable, updateTable, deleteTable,
  listReservations, createReservation, updateReservationStatus, deleteReservation,
} from '../db/reservations.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof ReservationError ? 400 : 500);

// ── Locations ────────────────────────────────────────────────────────────

router.get('/locations', requirePermission('Reservation', 'read'), async (_req: AuthedRequest, res) => {
  try {
    res.json(await listLocations());
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/locations', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name, type } = req.body ?? {};
    res.status(201).json(await createLocation({ name, type }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/locations/:id', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name, type } = req.body ?? {};
    res.json(await updateLocation(req.params.id, { name, type }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/locations/:id', requirePermission('Reservation', 'delete'), async (req: AuthedRequest, res) => {
  try {
    await deleteLocation(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Tables ───────────────────────────────────────────────────────────────

router.get('/tables', requirePermission('Reservation', 'read'), async (req: AuthedRequest, res) => {
  try {
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
    res.json(await listTables({ locationId }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/tables', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { locationId, name, type, capacity } = req.body ?? {};
    if (typeof locationId !== 'string') return res.status(400).json({ message: 'locationId is required' });
    if (typeof capacity !== 'number') return res.status(400).json({ message: 'capacity must be a number' });
    res.status(201).json(await createTable({ locationId, name, type, capacity }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/tables/:id', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name, type, capacity } = req.body ?? {};
    if (capacity !== undefined && typeof capacity !== 'number') return res.status(400).json({ message: 'capacity must be a number' });
    res.json(await updateTable(req.params.id, { name, type, capacity }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/tables/:id', requirePermission('Reservation', 'delete'), async (req: AuthedRequest, res) => {
  try {
    await deleteTable(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Reservations ─────────────────────────────────────────────────────────

router.get('/', requirePermission('Reservation', 'read'), async (req: AuthedRequest, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const tableId = typeof req.query.tableId === 'string' ? req.query.tableId : undefined;
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
    res.json(await listReservations({ date, tableId, locationId }));
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
    res.status(201).json(row);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/:id/status', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { status: newStatus } = req.body ?? {};
    if (typeof newStatus !== 'string') return res.status(400).json({ message: 'status is required' });
    res.json(await updateReservationStatus(req.params.id, newStatus));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/:id', requirePermission('Reservation', 'delete'), async (req: AuthedRequest, res) => {
  try {
    await deleteReservation(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
