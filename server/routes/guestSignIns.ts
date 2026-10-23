// Guest sign-in register routes (see server/db/guestSignIns.ts). Gated by the
// same `Reservation` permission as the booking book it sits beside on the
// Reservations page - front of house works both from one screen. No public
// sub-routes, so authMiddleware is applied router-wide.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  GuestSignInError,
  listSignIns, listSignInPage, createSignIn, updateSignIn, assignTable, extendSignIn, signOut, deleteSignIn,
  estimateWaitMinutes, markNotified, reorder,
} from '../db/guestSignIns.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A coded GuestSignInError is a resolvable floor situation (booking clash,
 *  merge prompt, over-capacity) - 409 with the detail the UI branches on.
 *  Any other GuestSignInError is a plain 400; anything else is a 500. */
function fail(res: import('express').Response, err: unknown) {
  if (err instanceof GuestSignInError && err.code) {
    return res.status(409).json({ message: message(err), code: err.code, detail: err.detail ?? {} });
  }
  return res.status(err instanceof GuestSignInError ? 400 : 500).json({ message: message(err) });
}

router.get('/', requirePermission('GuestRegister', 'read'), async (req: AuthedRequest, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
    const onPremisesOnly = req.query.onPremisesOnly === 'true';
    const unseatedOnly = req.query.unseatedOnly === 'true';
    res.json(await listSignIns({ date, areaId, onPremisesOnly, unseatedOnly }));
  } catch (err) {
    fail(res, err);
  }
});

// Every entry across all days, filtered and paged (the "All" list). Declared before the by-id routes.
router.get('/all', requirePermission('GuestRegister', 'read'), async (req: AuthedRequest, res) => {
  try {
    const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
    const num = (v: unknown) => (typeof v === 'string' && v !== '' ? Number(v) : undefined);
    res.json(await listSignInPage({
      from: str(req.query.from), to: str(req.query.to), areaId: str(req.query.areaId), tableId: str(req.query.tableId),
      visitType: str(req.query.visitType), q: str(req.query.q), state: str(req.query.state),
      limit: num(req.query.limit), offset: num(req.query.offset),
    }));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/estimate', requirePermission('GuestRegister', 'read'), async (req: AuthedRequest, res) => {
  try {
    const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
    const partySize = Number(req.query.partySize);
    if (!Number.isInteger(partySize) || partySize <= 0) {
      return res.status(400).json({ message: 'partySize must be a positive whole number' });
    }
    res.json({ minutes: await estimateWaitMinutes({ areaId, partySize }) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', requirePermission('GuestRegister', 'write'), async (req: AuthedRequest, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body.guestName !== 'string') return res.status(400).json({ message: 'guestName is required' });
    res.status(201).json(await createSignIn(req.user!.id, body));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id', requirePermission('GuestRegister', 'write'), async (req: AuthedRequest, res) => {
  try {
    res.json(await updateSignIn(req.params.id, req.body ?? {}));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/assign-table', requirePermission('GuestRegister', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { tableId, expectedUntil } = req.body ?? {};
    if (tableId !== null && typeof tableId !== 'string') {
      return res.status(400).json({ message: 'tableId must be a string or null' });
    }
    res.json(await assignTable(req.params.id, { tableId, expectedUntil }));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/extend', requirePermission('GuestRegister', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { minutes } = req.body ?? {};
    if (typeof minutes !== 'number') return res.status(400).json({ message: 'minutes must be a number' });
    res.json(await extendSignIn(req.params.id, { minutes }));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/notify', requirePermission('GuestRegister', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { notifiedVia } = req.body ?? {};
    res.json(await markNotified(req.params.id, { notifiedVia }));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/reorder', requirePermission('GuestRegister', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { direction } = req.body ?? {};
    if (direction !== 'up' && direction !== 'down') return res.status(400).json({ message: 'direction must be "up" or "down"' });
    res.json(await reorder(req.params.id, direction));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/sign-out', requirePermission('GuestRegister', 'write'), async (req: AuthedRequest, res) => {
  try {
    res.json(await signOut(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:id', requirePermission('GuestRegister', 'delete'), async (req: AuthedRequest, res) => {
  try {
    await deleteSignIn(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
