// Read-only data for the Production/Kiln & Energy/Labour Efficiency ops
// pages (src/components/dashboard/ops/). Gated by the existing `Operations`
// permission that already gates those pages - these endpoints exist purely
// to feed them, not a general-purpose data surface.
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { dailyProductionByStage, productionKpis, dailyKilnLoads, dailyFiringTypes, dailyProductionByItem } from '../db/productionLog.ts';
import { coverageByFunctionalArea, weeklyOffDistribution, availableWeeks } from '../db/shiftRoster.ts';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('Operations', 'read'));

/** GET /api/ops/production-summary */
router.get('/production-summary', async (_req, res) => {
  const [daily, kpis] = await Promise.all([dailyProductionByStage(), productionKpis()]);
  res.json({ daily, kpis });
});

/** GET /api/ops/kiln-summary */
router.get('/kiln-summary', async (_req, res) => {
  const [kilnLoads, firingTypes] = await Promise.all([dailyKilnLoads(), dailyFiringTypes()]);
  res.json({ kilnLoads, firingTypes });
});

/** GET /api/ops/items-summary */
router.get('/items-summary', async (_req, res) => {
  res.json({ items: await dailyProductionByItem() });
});

/** GET /api/ops/labour-summary?week=YYYY-MM-DD */
router.get('/labour-summary', async (req, res) => {
  const weekStart = typeof req.query.week === 'string' ? req.query.week : undefined;
  const [coverage, weeklyOffs, weeks] = await Promise.all([
    coverageByFunctionalArea(weekStart),
    weeklyOffDistribution(weekStart),
    availableWeeks(),
  ]);
  res.json({ coverage, weeklyOffs, weeks, week: weekStart ?? weeks.at(-1) ?? null });
});

export default router;
