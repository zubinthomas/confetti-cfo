// Engagement-hours log against the spec's 60h/month delivery budget (section
// 11 of implementation-guidelines-gap-analysis.md). Small, standalone - see
// server/db/timeLog.ts.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import { listEntries, createEntry, deleteEntry, TimeLogError } from '../db/timeLog.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof TimeLogError ? 400 : 500);

/** GET /api/time-log?month=YYYY-MM */
router.get('/', requirePermission('TimeLog', 'read'), async (req, res) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    res.json(await listEntries({ month }));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

/** POST /api/time-log - body { date, hours, note? } */
router.post('/', requirePermission('TimeLog', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { date, hours, note } = req.body ?? {};
    const entry = await createEntry(req.user!.id, { date, hours: Number(hours), note });
    res.status(201).json(entry);
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

/** DELETE /api/time-log/:id */
router.delete('/:id', requirePermission('TimeLog', 'delete'), async (req, res) => {
  try {
    await deleteEntry(Number(req.params.id));
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

export default router;
