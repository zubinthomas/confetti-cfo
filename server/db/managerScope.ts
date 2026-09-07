// Per-manager employee scoping, orthogonal to (and independent of) the
// division scoping in divisionScope.ts. Where division scope is an explicit
// admin-assigned grant, this is derived automatically from the org chart:
// employees.managerId (see schema.ts) links each employee to the one who
// manages them, and a manager linked to a login (employees.userId) sees
// their direct + indirect reports without needing a separate scope record.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

/** Employee ids reporting up (directly or indirectly) to the calling
 *  user's own linked employee record, plus themselves. Empty if the user
 *  isn't linked to an employee, or is linked but manages no one - in both
 *  cases callers should treat this the same as an empty division scope
 *  (no additional restriction from this mechanism). */
export async function getManagedEmployeeIds(userId: number): Promise<string[]> {
  await ready();
  const [self] = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.userId, userId));
  if (!self) return [];

  const all = await db.select({ id: schema.employees.id, managerId: schema.employees.managerId }).from(schema.employees);
  const childrenOf = new Map<string, string[]>();
  for (const e of all) {
    if (!e.managerId) continue;
    const list = childrenOf.get(e.managerId) ?? [];
    list.push(e.id);
    childrenOf.set(e.managerId, list);
  }

  const managed: string[] = [];
  const queue = [self.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const childId of childrenOf.get(current) ?? []) {
      managed.push(childId);
      queue.push(childId);
    }
  }
  if (managed.length === 0) return [];
  return [self.id, ...managed];
}
