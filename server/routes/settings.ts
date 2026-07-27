// Settings CRUD (server/db/settings.ts). Writes are disabled for now - this
// table doesn't drive runtime config yet, so edits here wouldn't do anything;
// re-enable once the app actually reads from it instead of process.env.
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { listSettings, getSetting } from '../db/settings.ts';

const router = Router();
router.use(authMiddleware);

const WRITES_DISABLED = { message: 'Settings are read-only for now' };

type SettingRow = Awaited<ReturnType<typeof getSetting>>;

// Secret values (API keys, passwords, ...) are masked - the UI shows "set" / "not set", not the value.
function mask(row: NonNullable<SettingRow>) {
  if (!row.isSecret || !row.value) return row;
  return { ...row, value: '••••••••' };
}

/** GET /api/settings - the full catalog, in category order. */
router.get('/', requirePermission('Settings', 'read'), async (_req, res) => {
  const rows = await listSettings();
  res.json(rows.map(mask));
});

/** GET /api/settings/:key */
router.get('/:key', requirePermission('Settings', 'read'), async (req, res) => {
  const row = await getSetting(req.params.key.toUpperCase());
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(mask(row));
});

router.post('/', (_req, res) => res.status(403).json(WRITES_DISABLED));
router.put('/:key', (_req, res) => res.status(403).json(WRITES_DISABLED));
router.patch('/:key', (_req, res) => res.status(403).json(WRITES_DISABLED));
router.delete('/:key', (_req, res) => res.status(403).json(WRITES_DISABLED));

export default router;
