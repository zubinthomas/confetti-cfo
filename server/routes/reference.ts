import { Router } from 'express';
import { loadReferenceData } from '../db/reference.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = Router();

router.use(authMiddleware);

/** GET /api/reference - the small dimension tables (businesses, business
 * units, periods, line items, categories, channels, vendors). Cheap enough
 * to load in full once per session. */
router.get('/', async (_req, res) => {
  try {
    res.json(await loadReferenceData());
  } catch (err) {
    console.error('reference error:', err);
    res.status(500).json({ message: 'Failed to load reference data' });
  }
});

export default router;
