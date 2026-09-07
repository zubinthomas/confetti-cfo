// Converting a recruitment pipeline entry into a real employee - the one
// step the generic entity CRUD (server/db.ts) can't express, since it has
// to create the employees row and update the recruitments row (stage
// 'Hired' + convertedEmployeeId) atomically. Reuses mapEntityInput/
// mapEntityOutput so the employee payload keeps the exact same snake_case
// API shape Employee.create() already accepts.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { mapEntityInput, mapEntityOutput } from '../db.ts';

export class HireError extends Error {}

export async function hireApplicant(recruitmentId: string, employeeData: Record<string, unknown>) {
  await ready();
  const [recruitment] = await db.select().from(schema.recruitments).where(eq(schema.recruitments.id, recruitmentId));
  if (!recruitment) throw new HireError(`No recruitment with id ${recruitmentId}`);
  if (recruitment.convertedEmployeeId) throw new HireError('This applicant has already been hired.');

  const employeeRow = {
    ...mapEntityInput('Employee', employeeData),
    id: randomUUID(),
    createdDate: new Date().toISOString(),
  };

  return db.transaction(async (tx) => {
    const [employee] = await tx.insert(schema.employees).values(employeeRow).returning();
    const [updatedRecruitment] = await tx
      .update(schema.recruitments)
      .set({ stage: 'Hired', convertedEmployeeId: employee.id as string })
      .where(eq(schema.recruitments.id, recruitmentId))
      .returning();
    return {
      employee: mapEntityOutput('Employee', employee as Record<string, unknown>),
      recruitment: mapEntityOutput('Recruitment', updatedRecruitment as Record<string, unknown>),
    };
  });
}
