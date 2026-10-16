// Current owner/deadline/note for a named recurring exception (see
// schema.ts's exception_assignments comment). One mutable row per
// exceptionKey, upserted on write - not a per-occurrence ticket log.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class ExceptionAssignmentError extends Error {}

const selectWithOwner = () => db
  .select({
    id: schema.exceptionAssignments.id,
    exceptionKey: schema.exceptionAssignments.exceptionKey,
    ownerUserId: schema.exceptionAssignments.ownerUserId,
    ownerName: schema.users.fullName,
    ownerEmail: schema.users.email,
    deadline: schema.exceptionAssignments.deadline,
    note: schema.exceptionAssignments.note,
    updatedByUserId: schema.exceptionAssignments.updatedByUserId,
    updatedAt: schema.exceptionAssignments.updatedAt,
  })
  .from(schema.exceptionAssignments)
  .leftJoin(schema.users, eq(schema.users.id, schema.exceptionAssignments.ownerUserId));

export async function listAssignments() {
  await ready();
  return selectWithOwner();
}

export async function setAssignment(
  userId: number,
  exceptionKey: string,
  input: { ownerUserId?: number | null; deadline?: string | null; note?: string | null },
) {
  await ready();
  if (!exceptionKey) throw new ExceptionAssignmentError('exceptionKey is required');

  const now = new Date().toISOString();
  const [existing] = await db.select().from(schema.exceptionAssignments)
    .where(eq(schema.exceptionAssignments.exceptionKey, exceptionKey));

  if (existing) {
    await db.update(schema.exceptionAssignments).set({
      ownerUserId: input.ownerUserId ?? null,
      deadline: input.deadline ?? null,
      note: input.note ?? null,
      updatedByUserId: userId,
      updatedAt: now,
    }).where(eq(schema.exceptionAssignments.id, existing.id));
  } else {
    await db.insert(schema.exceptionAssignments).values({
      exceptionKey,
      ownerUserId: input.ownerUserId ?? null,
      deadline: input.deadline ?? null,
      note: input.note ?? null,
      updatedByUserId: userId,
      updatedAt: now,
    });
  }

  const [row] = await selectWithOwner().where(eq(schema.exceptionAssignments.exceptionKey, exceptionKey));
  return row;
}
