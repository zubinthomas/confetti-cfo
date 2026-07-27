import { Router } from 'express';
import { loadReferenceData } from '../db/reference.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = Router();

router.use(authMiddleware);

/** GET /api/reference - the small dimension tables (businesses, business
 * units, periods, line items, categories, channels, vendors). Cheap enough
 * to load in full once per session. Open to any authenticated user, not
 * RBAC-gated: every dashboard page fetches this as a prerequisite (see
 * ReferenceDataGate in src/App.tsx) before any per-route permission check
 * runs, and it holds only organizational taxonomy (business/department/
 * category/channel/vendor names), not financial values - gating it would
 * just lock users with a legitimate but narrow role (e.g. Licence:read
 * only) out of the whole dashboard shell before they ever reach the page
 * they actually have access to. */
router.get('/', async (_req, res) => {
  try {
    res.json(await loadReferenceData());
  } catch (err) {
    console.error('reference error:', err);
    res.status(500).json({ message: 'Failed to load reference data' });
  }
});

export default router;
