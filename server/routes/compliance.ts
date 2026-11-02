// Four read-only endpoints for the Compliance Payment Tracker import
// (server/import/parseCompliance.ts, mergeCompliance.ts). Dedicated route
// file rather than the generic entity CRUD layer (server/routes/
// entities.ts) - payments needs query-param filtering the generic layer
// doesn't support, and directors needs the DirectorKyc permission to
// actually gate the data, which only works if nothing else can read that
// table through a different path. Don't add these tables to server/db.ts's
// TABLES map - that would expose unscoped generic CRUD on
// compliance_directors, defeating the point of the tighter gate.
import { Router } from 'express';
import {
  listCompliancePayments, listComplianceDocuments, listComplianceTrademarks, listComplianceDirectors,
} from '../db/compliance.ts';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';

const router = Router();
router.use(authMiddleware);

const isCategory = (c: unknown): c is 'licence_tax' | 'insurance' => c === 'licence_tax' || c === 'insurance';

/** GET /api/compliance/payments?category=licence_tax|insurance */
router.get('/payments', requirePermission('Licence', 'read'), async (req, res) => {
  const category = isCategory(req.query.category) ? req.query.category : undefined;
  res.json(await listCompliancePayments(category));
});

router.get('/documents', requirePermission('Licence', 'read'), async (_req, res) => {
  res.json(await listComplianceDocuments());
});

router.get('/trademarks', requirePermission('Licence', 'read'), async (_req, res) => {
  res.json(await listComplianceTrademarks());
});

// Aadhaar/PAN - gated by DirectorKyc, not Licence, and not granted to the
// built-in Viewer role by default (server/db/permissions.ts).
router.get('/directors', requirePermission('DirectorKyc', 'read'), async (_req, res) => {
  res.json(await listComplianceDirectors());
});

export default router;
