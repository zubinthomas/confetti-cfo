import { Router } from 'express';
import { loadDataset } from '../db/dataset.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = Router();

router.use(authMiddleware);

/** GET /api/dataset — the full financial dataset for the dashboards. */
router.get('/', async (_req, res) => {
  try {
    res.json(await loadDataset());
  } catch (err) {
    console.error('dataset error:', err);
    res.status(500).json({ message: 'Failed to load dataset' });
  }
});

export default router;
