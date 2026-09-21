// Feature roadmap board - server/roadmap/items.json, a plain hand-edited
// file, not DB-backed. Open to any authenticated user, not RBAC-gated -
// same posture as reference.ts (see that file's comment for the reasoning).
// There is no Roadmap resource in server/db/permissions.ts yet; adding one
// (READ_ONLY, mirroring Settings) plus a requirePermission('Roadmap','read')
// call here is the follow-up path if this needs locking down later.
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authMiddleware } from '../middleware/auth.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ITEMS_PATH = path.join(__dirname, '..', 'roadmap', 'items.json');

const router = Router();
router.use(authMiddleware);

/** GET /api/roadmap - reads items.json fresh off disk per request (tiny
 *  file, no caching needed) so a hand-edit takes effect on the next
 *  request with no server restart. */
router.get('/', (_req, res) => {
  try {
    const raw = readFileSync(ITEMS_PATH, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('roadmap error:', err);
    res.status(500).json({ message: 'Failed to load roadmap' });
  }
});

export default router;
