import { Router } from 'express';
import { listEntities, createEntity, updateEntity, deleteEntity, getEntityRow } from '../db.ts';
import { authMiddleware, requireEntityPermission, type AuthedRequest } from '../middleware/auth.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';

const router = Router();

// All entity routes require authentication
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/entities/:entity?sort=-created_date */
router.get('/:entity', requireEntityPermission('read'), async (req: AuthedRequest, res) => {
  try {
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const scope = await getUserDivisionScope(req.user!.id);
    const items = await listEntities(req.params.entity, sort, scope);
    res.json(items);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

/** POST /api/entities/:entity */
router.post('/:entity', requireEntityPermission('write'), async (req: AuthedRequest, res) => {
  try {
    const scope = await getUserDivisionScope(req.user!.id);
    if (scope.length > 0 && !scope.includes(req.body?.division)) {
      return res.status(403).json({ message: `You can only create records in: ${scope.join(', ')}` });
    }
    const item = await createEntity(req.params.entity, req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

/** PUT /api/entities/:entity/:id */
router.put('/:entity/:id', requireEntityPermission('write'), async (req: AuthedRequest, res) => {
  try {
    const scope = await getUserDivisionScope(req.user!.id);
    if (scope.length > 0) {
      const current = await getEntityRow(req.params.entity, req.params.id);
      if (!current || !scope.includes(current.division as string)) {
        return res.status(403).json({ message: 'That record is outside your assigned division.' });
      }
      if (req.body?.division !== undefined && !scope.includes(req.body.division)) {
        return res.status(403).json({ message: `You can only assign records to: ${scope.join(', ')}` });
      }
    }
    const item = await updateEntity(req.params.entity, req.params.id, req.body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

/** DELETE /api/entities/:entity/:id */
router.delete('/:entity/:id', requireEntityPermission('delete'), async (req: AuthedRequest, res) => {
  try {
    const scope = await getUserDivisionScope(req.user!.id);
    if (scope.length > 0) {
      const current = await getEntityRow(req.params.entity, req.params.id);
      if (!current || !scope.includes(current.division as string)) {
        return res.status(403).json({ message: 'That record is outside your assigned division.' });
      }
    }
    const ok = await deleteEntity(req.params.entity, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(400).json({ message: message(err) });
  }
});

export default router;
