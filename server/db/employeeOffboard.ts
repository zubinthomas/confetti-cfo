// Offboarding: recording an employee_exits row and flipping the employee's
// status to 'Terminated' atomically - the generic entity CRUD (server/db.ts)
// can't express the two-table side effect, same rationale as
// server/db/recruitmentHire.ts's hire flow.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { mapEntityOutput } from '../db.ts';

export class OffboardError extends Error {}

const EXIT_TYPES = ['resignation', 'termination', 'end_of_contract'] as const;
type ExitType = typeof EXIT_TYPES[number];

export interface OffboardInput {
  exitType: string;
  noticeDate?: string | null;
  lastWorkingDate?: string | null;
  reason?: string | null;
  exitInterviewNotes?: string | null;
  assetsReturned?: boolean;
  fullSettlementDone?: boolean;
  rehireEligible?: boolean;
}

export async function offboardEmployee(employeeId: string, input: OffboardInput) {
  await ready();
  const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  if (!employee) throw new OffboardError(`No employee with id ${employeeId}`);
  if (!EXIT_TYPES.includes(input.exitType as ExitType)) {
    throw new OffboardError(`exitType must be one of: ${EXIT_TYPES.join(', ')}`);
  }

  return db.transaction(async (tx) => {
    const [exit] = await tx.insert(schema.employeeExits).values({
      id: randomUUID(),
      createdDate: new Date().toISOString(),
      employeeId,
      division: employee.division,
      exitType: input.exitType as ExitType,
      noticeDate: input.noticeDate || null,
      lastWorkingDate: input.lastWorkingDate || null,
      reason: input.reason || null,
      exitInterviewNotes: input.exitInterviewNotes || null,
      assetsReturned: input.assetsReturned ?? false,
      fullSettlementDone: input.fullSettlementDone ?? false,
      rehireEligible: input.rehireEligible ?? true,
    }).returning();
    const [updatedEmployee] = await tx.update(schema.employees)
      .set({ status: 'Terminated' })
      .where(eq(schema.employees.id, employeeId))
      .returning();
    return {
      exit: mapEntityOutput('EmployeeExit', exit as Record<string, unknown>),
      employee: mapEntityOutput('Employee', updatedEmployee as Record<string, unknown>),
    };
  });
}
