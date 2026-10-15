// Database backup history + on-demand trigger (server/db/backup.ts). No
// download or delete route on purpose - a backup file is a complete,
// unencrypted copy of the whole database (every salary, Aadhar, PAN, bank
// account), so retrieving one for off-site copying or an actual restore
// stays SSH-only, matching how this app is already operated (manual
// certbot, manual restarts) rather than adding a one-click full-database-
// dump download surface over HTTP.
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';
import { createBackup, listBackups } from '../db/backup.ts';

const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/backups - backup history (filename/time/size only). */
router.get('/', requirePermission('Backup', 'read'), async (_req, res) => {
  try {
    res.json(await listBackups());
  } catch (err) {
    res.status(500).json({ message: message(err) });
  }
});

/** POST /api/backups - trigger a backup now, outside the daily schedule. */
router.post('/', requirePermission('Backup', 'write'), async (_req, res) => {
  try {
    res.status(201).json(await createBackup());
  } catch (err) {
    res.status(500).json({ message: message(err) });
  }
});

export default router;
