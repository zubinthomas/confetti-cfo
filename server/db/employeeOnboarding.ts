// Onboarding stage tracking - one row per employee (unique on employeeId),
// created lazily on first access. Each stage is an independent checkbox
// (a nullable timestamp - not done vs. done, not a strict linear gate),
// mirroring server/db/employeeOffboard.ts's shape but without an approval
// step. Completing the final stage flips employees.status to 'Active'
// atomically, converging a new hire into the normal employee lifecycle -
// everything before that is tracking only, no other side effects.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class OnboardingError extends Error {}

// Order matters - both for the denormalized `stage` label (the furthest
// stage reached) and for the frontend's checklist order. This is a
// best-guess default sequence (see schema.ts's comment on
// employeeOnboarding) - not a confirmed client requirement.
const STAGES = [
  { field: 'offer_accepted', column: 'offerAcceptedAt', label: 'Offer Accepted' },
  { field: 'documents_collected', column: 'documentsCollectedAt', label: 'Documents Collected' },
  { field: 'account_created', column: 'accountCreatedAt', label: 'Account Created' },
  { field: 'id_card_issued', column: 'idCardIssuedAt', label: 'ID Card Issued' },
  { field: 'orientation_complete', column: 'orientationCompleteAt', label: 'Orientation Complete' },
] as const;
type StageField = typeof STAGES[number]['field'];

function currentStageLabel(row: Record<string, unknown>): string {
  let label = 'Not Started';
  for (const s of STAGES) {
    if (row[s.column]) label = s.label;
  }
  return label;
}

export async function getOrCreateOnboarding(employeeId: string) {
  await ready();
  const [existing] = await db.select().from(schema.employeeOnboarding).where(eq(schema.employeeOnboarding.employeeId, employeeId));
  if (existing) return existing;

  const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  if (!employee) throw new OnboardingError(`No employee with id ${employeeId}`);

  const [created] = await db.insert(schema.employeeOnboarding).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    employeeId,
    division: employee.division,
    stage: 'Not Started',
  }).returning();
  return created;
}

/** Scoped listing for HeadcountTab's bulk load (same pattern as
 *  EmployeeExit.list()) - not a generic entity (server/db.ts), since a row
 *  is lazily created rather than user-initiated, but read access should
 *  still respect division scope like every other HR list. */
export async function listOnboarding(divisionScope: string[]) {
  await ready();
  const rows = await db.select().from(schema.employeeOnboarding);
  if (divisionScope.length === 0) return rows;
  return rows.filter((r) => r.division && divisionScope.includes(r.division));
}

export async function setOnboardingStage(employeeId: string, field: string, completed: boolean) {
  await ready();
  const stage = STAGES.find((s) => s.field === field);
  if (!stage) throw new OnboardingError(`field must be one of: ${STAGES.map((s) => s.field).join(', ')}`);

  const row = await getOrCreateOnboarding(employeeId);
  const nextRow = { ...row, [stage.column]: completed ? new Date().toISOString() : null };

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(schema.employeeOnboarding)
      .set({ [stage.column]: nextRow[stage.column], stage: currentStageLabel(nextRow) })
      .where(eq(schema.employeeOnboarding.id, row.id))
      .returning();
    if ((field as StageField) === 'orientation_complete' && completed) {
      await tx.update(schema.employees).set({ status: 'Active' }).where(eq(schema.employees.id, employeeId));
    }
    return updated;
  });
}
