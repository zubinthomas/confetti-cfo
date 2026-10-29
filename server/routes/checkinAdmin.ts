// Staff side of the guest self check-in: settings, the on-site token and which
// areas guests may pick (GuestCheckIn permission). The public page itself is
// server/routes/publicCheckin.ts. Mounted at /api/restaurant, ahead of the
// reservation routes, so the paths below never reach their '/:id' handlers.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  CheckinError, getCheckinSettings, updateCheckinSettings, rotateCheckinToken, setCheckinAreas, type CheckinPatch,
} from '../db/checkinSettings.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof CheckinError ? 400 : 500);

router.get('/checkin-settings', requirePermission('GuestCheckIn', 'read'), async (_req: AuthedRequest, res) => {
  try {
    res.json(await getCheckinSettings());
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.patch('/checkin-settings', requirePermission('GuestCheckIn', 'write'), async (req: AuthedRequest, res) => {
  try {
    const b = (req.body ?? {}) as CheckinPatch;
    res.json(await updateCheckinSettings({
      enabled: b.enabled, bookingBufferMinutes: b.bookingBufferMinutes, minutesPerParty: b.minutesPerParty,
      maxPartySize: b.maxPartySize, maxWaitMinutes: b.maxWaitMinutes, venueWhatsapp: b.venueWhatsapp, shopUrl: b.shopUrl,
    }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/checkin-settings/rotate-token', requirePermission('GuestCheckIn', 'write'), async (_req: AuthedRequest, res) => {
  try {
    res.json(await rotateCheckinToken());
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.put('/checkin-settings/areas', requirePermission('GuestCheckIn', 'write'), async (req: AuthedRequest, res) => {
  try {
    await setCheckinAreas(req.body?.areaIds);
    res.json({ message: 'Saved' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
