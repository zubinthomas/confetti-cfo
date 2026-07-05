import { Router } from 'express';
import { listEntities, createEntity, updateEntity, deleteEntity } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All entity routes require authentication
router.use(authMiddleware);

/** GET /api/entities/:entity?sort=-created_date */
router.get('/:entity', (req, res) => {
  try {
    const items = listEntities(req.params.entity, req.query.sort);
    res.json(items);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/** POST /api/entities/:entity */
router.post('/:entity', (req, res) => {
  try {
    const item = createEntity(req.params.entity, req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/** PUT /api/entities/:entity/:id */
router.put('/:entity/:id', (req, res) => {
  try {
    const item = updateEntity(req.params.entity, req.params.id, req.body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/** DELETE /api/entities/:entity/:id */
router.delete('/:entity/:id', (req, res) => {
  try {
    const ok = deleteEntity(req.params.entity, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
