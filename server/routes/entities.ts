import { Router } from 'express';
import { listEntities, createEntity, updateEntity, deleteEntity, getEntityRow } from '../db.ts';
import { authMiddleware, requireEntityPermission, type AuthedRequest } from '../middleware/auth.ts';
import { getUserDivisionScope } from '../db/divisionScope.ts';
import { getManagedEmployeeIds } from '../db/managerScope.ts';

// Row column (in API/snake_case shape) that identifies which employee a row
// belongs to, per entity - same mapping as server/db.ts's
// MANAGER_SCOPE_COLUMN but keyed to the already-mapped getEntityRow output
// this file works with, for the write-path ownership check below.
const MANAGER_SCOPE_FIELD: Record<string, string> = {
  Employee: 'id',
  PayrollRecord: 'employee_id',
};

const router = Router();

// All entity routes require authentication
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** GET /api/entities/:entity?sort=-created_date */
router.get('/:entity', requireEntityPermission('read'), async (req: AuthedRequest, res) => {
  try {
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const scope = await getUserDivisionScope(req.user!.id);
    const managedIds = await getManagedEmployeeIds(req.user!.id);
    const items = await listEntities(req.params.entity, sort, scope, managedIds);
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
    const managedIds = await getManagedEmployeeIds(req.user!.id);
    const managerField = MANAGER_SCOPE_FIELD[req.params.entity];
    if (scope.length > 0 || (managedIds.length > 0 && managerField)) {
      const current = await getEntityRow(req.params.entity, req.params.id);
      if (!current) return res.status(404).json({ message: 'Not found' });
      if (scope.length > 0 && !scope.includes(current.division as string)) {
        return res.status(403).json({ message: 'That record is outside your assigned division.' });
      }
      if (managedIds.length > 0 && managerField && !managedIds.includes(current[managerField] as string)) {
        return res.status(403).json({ message: 'That record is outside the employees you manage.' });
      }
      if (req.body?.division !== undefined && !scope.includes(req.body.division) && scope.length > 0) {
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
    const managedIds = await getManagedEmployeeIds(req.user!.id);
    const managerField = MANAGER_SCOPE_FIELD[req.params.entity];
    if (scope.length > 0 || (managedIds.length > 0 && managerField)) {
      const current = await getEntityRow(req.params.entity, req.params.id);
      if (!current) return res.status(404).json({ message: 'Not found' });
      if (scope.length > 0 && !scope.includes(current.division as string)) {
        return res.status(403).json({ message: 'That record is outside your assigned division.' });
      }
      if (managedIds.length > 0 && managerField && !managedIds.includes(current[managerField] as string)) {
        return res.status(403).json({ message: 'That record is outside the employees you manage.' });
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
