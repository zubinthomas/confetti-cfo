// Read layer for the four Compliance Payment Tracker tables (server/import/
// mergeCompliance.ts writes them). Company-wide, not division-scoped - same
// reasoning as bills.ts. Read-only for v1 - no write/delete; re-upload the
// source workbook is the only update path (see the compliance import plan).
import { asc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

/** `category` filters to just licence_tax or insurance rows; omitted
 *  returns both. Ordered by due date so the oldest/most-pressing item leads. */
export async function listCompliancePayments(category?: 'licence_tax' | 'insurance') {
  await ready();
  const q = db.select().from(schema.compliancePayments);
  const rows = category ? await q.where(eq(schema.compliancePayments.category, category)) : await q;
  return rows.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
}

export async function listComplianceDocuments() {
  await ready();
  return db.select().from(schema.complianceDocuments).orderBy(asc(schema.complianceDocuments.documentName));
}

export async function listComplianceTrademarks() {
  await ready();
  return db.select().from(schema.complianceTrademarks).orderBy(asc(schema.complianceTrademarks.applicationNo));
}

/** Gated by the DirectorKyc permission at the route layer, not here - this
 *  function has no access check of its own, same as every other listX()
 *  in this file; never call it from a path that skips requirePermission. */
export async function listComplianceDirectors() {
  await ready();
  return db.select().from(schema.complianceDirectors).orderBy(asc(schema.complianceDirectors.name));
}
