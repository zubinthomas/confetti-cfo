import { Router } from 'express';
import { listEntities, createEntity, updateEntity, deleteEntity } from '../db.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = Router();

// All entity routes require authentication
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/entities/:entity?sort=-created_date */
router.get('/:entity', async (req, res) => {
  try {
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const items = await listEntities(req.params.entity, sort);
    res.json(items);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

/** POST /api/entities/:entity */
router.post('/:entity', async (req, res) => {
  try {
    const item = await createEntity(req.params.entity, req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

/** PUT /api/entities/:entity/:id */
router.put('/:entity/:id', async (req, res) => {
  try {
    const item = await updateEntity(req.params.entity, req.params.id, req.body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

/** DELETE /api/entities/:entity/:id */
router.delete('/:entity/:id', async (req, res) => {
  try {
    const ok = await deleteEntity(req.params.entity, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

export default router;
