// Offboarding: submit -> approve/reject -> finalize. Submitting records an
// employee_exits row and moves employees.status to 'Notice Period'
// atomically; finalizing (only once approved) sets the terminal status and
// deactivates the linked user account, also atomically. The generic entity
// CRUD (server/db.ts) can't express these multi-table side effects, same
// rationale as server/db/recruitmentHire.ts's hire flow.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { mapEntityOutput } from '../db.ts';
import { getManagedEmployeeIds } from './managerScope.ts';

export class OffboardError extends Error {}

const EXIT_TYPES = ['resignation', 'termination', 'end_of_contract'] as const;
type ExitType = typeof EXIT_TYPES[number];

// snake_case, matching the wire contract src/api/hrApi.ts sends - the
// offboarding routes hand req.body to these functions unconverted, unlike
// the generic entity CRUD (server/db.ts), which maps snake_case<->camelCase
// itself.
export interface OffboardInput {
  exit_type: string;
  notice_date?: string | null;
  last_working_date?: string | null;
  reason?: string | null;
  exit_interview_notes?: string | null;
  assets_returned?: boolean;
  full_settlement_done?: boolean;
  rehire_eligible?: boolean;
  settlement_amount?: number | null;
}

export async function submitOffboarding(employeeId: string, input: OffboardInput) {
  await ready();
  const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  if (!employee) throw new OffboardError(`No employee with id ${employeeId}`);
  if (!EXIT_TYPES.includes(input.exit_type as ExitType)) {
    throw new OffboardError(`exit_type must be one of: ${EXIT_TYPES.join(', ')}`);
  }

  return db.transaction(async (tx) => {
    const [exit] = await tx.insert(schema.employeeExits).values({
      id: randomUUID(),
      createdDate: new Date().toISOString(),
      employeeId,
      division: employee.division,
      exitType: input.exit_type as ExitType,
      noticeDate: input.notice_date || null,
      lastWorkingDate: input.last_working_date || null,
      reason: input.reason || null,
      exitInterviewNotes: input.exit_interview_notes || null,
      assetsReturned: input.assets_returned ?? false,
      fullSettlementDone: input.full_settlement_done ?? false,
      rehireEligible: input.rehire_eligible ?? true,
      settlementAmount: input.settlement_amount ?? null,
      approvalStatus: 'pending',
      previousStatus: employee.status,
    }).returning();
    const [updatedEmployee] = await tx.update(schema.employees)
      .set({ status: 'Notice Period' })
      .where(eq(schema.employees.id, employeeId))
      .returning();
    return {
      exit: mapEntityOutput('EmployeeExit', exit as Record<string, unknown>),
      employee: mapEntityOutput('Employee', updatedEmployee as Record<string, unknown>),
    };
  });
}

/** Approve or reject a pending offboarding request. Restricted to the
 *  employee's manager chain (server/db/managerScope.ts) when the approving
 *  user is linked to one - unlinked users (HR/Admin accounts with no
 *  employee record of their own) aren't restricted by this mechanism, same
 *  convention as every other manager-scoped check in this codebase.
 *  Rejecting restores employees.status to what it was before submission. */
export async function decideOffboarding(exitId: string, approverUserId: number, decision: 'approved' | 'rejected') {
  await ready();
  const [exit] = await db.select().from(schema.employeeExits).where(eq(schema.employeeExits.id, exitId));
  if (!exit) throw new OffboardError(`No exit record with id ${exitId}`);
  if (exit.approvalStatus !== 'pending') {
    throw new OffboardError('This offboarding request has already been decided');
  }

  const managedIds = await getManagedEmployeeIds(approverUserId);
  if (managedIds.length > 0 && !managedIds.includes(exit.employeeId)) {
    throw new OffboardError('You can only approve or reject offboarding requests for employees you manage');
  }

  return db.transaction(async (tx) => {
    const [updatedExit] = await tx.update(schema.employeeExits)
      .set({ approvalStatus: decision, approvedByUserId: approverUserId, approvedAt: new Date().toISOString() })
      .where(eq(schema.employeeExits.id, exitId))
      .returning();
    let updatedEmployee;
    if (decision === 'rejected') {
      [updatedEmployee] = await tx.update(schema.employees)
        .set({ status: exit.previousStatus || 'Active' })
        .where(eq(schema.employees.id, exit.employeeId))
        .returning();
    } else {
      [updatedEmployee] = await tx.select().from(schema.employees).where(eq(schema.employees.id, exit.employeeId));
    }
    return {
      exit: mapEntityOutput('EmployeeExit', updatedExit as Record<string, unknown>),
      employee: mapEntityOutput('Employee', updatedEmployee as Record<string, unknown>),
    };
  });
}

/** Finalize an approved offboarding: sets the exitType-appropriate terminal
 *  status and deactivates the linked user account (if any) in the same
 *  transaction - this is the actual access-revocation step; nothing before
 *  it touches login access. */
export async function finalizeOffboarding(exitId: string) {
  await ready();
  const [exit] = await db.select().from(schema.employeeExits).where(eq(schema.employeeExits.id, exitId));
  if (!exit) throw new OffboardError(`No exit record with id ${exitId}`);
  if (exit.approvalStatus !== 'approved') {
    throw new OffboardError('This offboarding request has not been approved yet');
  }
  const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, exit.employeeId));
  if (!employee) throw new OffboardError(`No employee with id ${exit.employeeId}`);

  const terminalStatus = exit.exitType === 'resignation' ? 'Resigned' : 'Terminated';

  return db.transaction(async (tx) => {
    const [updatedEmployee] = await tx.update(schema.employees)
      .set({ status: terminalStatus })
      .where(eq(schema.employees.id, exit.employeeId))
      .returning();
    if (employee.userId) {
      await tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, employee.userId));
    }
    return {
      exit: mapEntityOutput('EmployeeExit', exit as Record<string, unknown>),
      employee: mapEntityOutput('Employee', updatedEmployee as Record<string, unknown>),
    };
  });
}
