// Read-only weekly shift roster for the HR Roster tab
// (src/components/hr/RosterTab.tsx). Reuses the `Employee` permission -
// this is staffing data about employees, not an Operations-dashboard
// concern, even though server/routes/opsData.ts reads the same table for a
// narrower "planned coverage" view.
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { weekRoster, availableWeeks } from '../db/shiftRoster.ts';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('Employee', 'read'));

/** GET /api/roster/weeks - all weekStart values with data, oldest first. */
router.get('/weeks', async (_req, res) => {
  res.json(await availableWeeks());
});

/** GET /api/roster?week=YYYY-MM-DD - defaults to the most recently uploaded week. */
router.get('/', async (req, res) => {
  const weekStart = typeof req.query.week === 'string' ? req.query.week : undefined;
  const [rows, weeks] = await Promise.all([weekRoster(weekStart), availableWeeks()]);
  res.json({ week: weekStart ?? weeks.at(-1) ?? null, weeks, rows });
});

export default router;
