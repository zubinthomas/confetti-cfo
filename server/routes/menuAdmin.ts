// Staff editing of the guest menu (Menu permission). Mounted at
// /api/restaurant/menu, ahead of the reservation routes.
import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  MenuError, listMenu, createSection, updateSection, deleteSection, createItem, updateItem, deleteItem, reorder,
} from '../db/menu.ts';

const router = Router();
router.use(authMiddleware);

const run = (fn: (req: AuthedRequest) => Promise<unknown>) => async (req: AuthedRequest, res: import('express').Response) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    res.status(err instanceof MenuError ? 400 : 500).json({ message: err instanceof Error ? err.message : String(err) });
  }
};

router.get('/menu', requirePermission('Menu', 'read'), run(() => listMenu()));
router.post('/menu/sections', requirePermission('Menu', 'write'), run((r) => createSection(r.body ?? {})));
router.put('/menu/sections/order', requirePermission('Menu', 'write'), run(async (r) => { await reorder('sections', r.body?.ids); return { message: 'Saved' }; }));
router.patch('/menu/sections/:id', requirePermission('Menu', 'write'), run((r) => updateSection(String(r.params.id), r.body ?? {})));
router.delete('/menu/sections/:id', requirePermission('Menu', 'delete'), run(async (r) => { await deleteSection(String(r.params.id)); return { message: 'Deleted' }; }));
router.post('/menu/sections/:id/items', requirePermission('Menu', 'write'), run((r) => createItem(String(r.params.id), r.body ?? {})));
router.put('/menu/items/order', requirePermission('Menu', 'write'), run(async (r) => { await reorder('items', r.body?.ids); return { message: 'Saved' }; }));
router.patch('/menu/items/:id', requirePermission('Menu', 'write'), run((r) => updateItem(String(r.params.id), r.body ?? {})));
router.delete('/menu/items/:id', requirePermission('Menu', 'delete'), run(async (r) => { await deleteItem(String(r.params.id)); return { message: 'Deleted' }; }));

export default router;
