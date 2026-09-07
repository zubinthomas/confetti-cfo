// Guest sign-in register routes (see server/db/guestSignIns.ts). Gated by the
// same `Reservation` permission as the booking book it sits beside on the
// Reservations page - front of house works both from one screen. No public
// sub-routes, so authMiddleware is applied router-wide.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  GuestSignInError,
  listSignIns, createSignIn, updateSignIn, assignTable, extendSignIn, signOut, deleteSignIn,
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

router.get('/', requirePermission('Reservation', 'read'), async (req: AuthedRequest, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
    const onPremisesOnly = req.query.onPremisesOnly === 'true';
    res.json(await listSignIns({ date, locationId, onPremisesOnly }));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body.guestName !== 'string') return res.status(400).json({ message: 'guestName is required' });
    res.status(201).json(await createSignIn(req.user!.id, body));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    res.json(await updateSignIn(req.params.id, req.body ?? {}));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/assign-table', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { tableId, expectedUntil, acknowledgeMerge } = req.body ?? {};
    if (tableId !== null && typeof tableId !== 'string') {
      return res.status(400).json({ message: 'tableId must be a string or null' });
    }
    res.json(await assignTable(req.params.id, { tableId, expectedUntil, acknowledgeMerge: acknowledgeMerge === true }));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/extend', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { minutes } = req.body ?? {};
    if (typeof minutes !== 'number') return res.status(400).json({ message: 'minutes must be a number' });
    res.json(await extendSignIn(req.params.id, { minutes }));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id/sign-out', requirePermission('Reservation', 'write'), async (req: AuthedRequest, res) => {
  try {
    res.json(await signOut(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:id', requirePermission('Reservation', 'delete'), async (req: AuthedRequest, res) => {
  try {
    await deleteSignIn(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
