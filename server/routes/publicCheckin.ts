// Public guest self check-in ("Check a Table"), mounted at /api/public/check-a-table.
// No login: every route needs the on-site token (the X-Checkin-Token header, from
// the QR code's link), is rate limited per client IP, and returns only what a
// guest at the venue should see. Staff manage it in server/routes/checkinAdmin.ts.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit, SlidingWindow } from '../middleware/rateLimit.ts';
import { checkinTokenValid } from '../db/checkinSettings.ts';
import {
  PublicCheckinError, publicConfig, publicCheck, joinWaitingList, spotStatus, leaveWaitingList, publicMenu,
} from '../db/publicCheckin.ts';

const router = Router();

router.use(rateLimit({ windowMs: 60_000, max: 90 }));

async function requireToken(req: Request, res: Response, next: NextFunction) {
  try {
    if (await checkinTokenValid(req.header('x-checkin-token'))) return next();
    res.status(403).json({ message: 'Please scan the code at the venue to use this page.', code: 'bad_token' });
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
}
router.use(requireToken);

const fail = (res: Response, err: unknown) => {
  if (err instanceof PublicCheckinError) return res.status(err.status).json({ message: err.message, code: err.code });
  console.error('public check-in:', err);
  res.status(500).json({ message: 'Something went wrong. Please speak to our host.' });
};

// Joining is the one write: a few per client per hour, and a few per phone number.
const joinsPerIp = new SlidingWindow(60 * 60_000, 10);
const joinsPerPhone = new SlidingWindow(60 * 60_000, 3);

router.get('/config', async (_req, res) => {
  try {
    res.json(await publicConfig());
  } catch (err) {
    fail(res, err);
  }
});

router.post('/check', async (req, res) => {
  try {
    res.json(await publicCheck(req.body?.areaId, req.body?.partySize));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/join', async (req, res) => {
  try {
    const phone = String(req.body?.phone ?? '').replace(/\D/g, '').slice(-10);
    if (!joinsPerIp.hit(req.ip ?? 'unknown') || (phone && !joinsPerPhone.hit(phone))) {
      return res.status(429).json({ message: 'Too many attempts. Please speak to our host.' });
    }
    const result = await joinWaitingList({
      areaId: req.body?.areaId, partySize: req.body?.partySize, phone: req.body?.phone, name: req.body?.name,
    });
    res.status(result.existing ? 200 : 201).json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/spot/:id', async (req, res) => {
  try {
    res.json(await spotStatus(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/spot/:id/leave', async (req, res) => {
  try {
    res.json(await leaveWaitingList(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/menu', async (req, res) => {
  try {
    res.json(await publicMenu(req.query.areaId));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
