// Read-only biometric attendance for the HR Attendance tab
// (src/components/hr/AttendanceTab.tsx). Reuses the `Employee` permission,
// same justification as routes/roster.ts.
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { availableMonths, monthAttendance, monthlySummary } from '../db/attendance.ts';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('Employee', 'read'));

/** GET /api/attendance/months - all 'YYYY-MM' values with data, oldest first. */
router.get('/months', async (_req, res) => {
  res.json(await availableMonths());
});

/** GET /api/attendance?month=YYYY-MM - defaults to the most recent month with data. */
router.get('/', async (req, res) => {
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  const [rows, months] = await Promise.all([monthAttendance(month), availableMonths()]);
  res.json({ month: month ?? months.at(-1) ?? null, months, rows, summary: monthlySummary(rows) });
});

export default router;
