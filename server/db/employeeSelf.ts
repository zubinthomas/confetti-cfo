// Employee self-service: the curated, read-only subset of an employee's own
// HR record, for the account linked via employees.userId (see
// server/db/invites.ts for how that link gets set). This is the one place
// that decides what's safe to hand back to an employee about themselves -
// notes and internalDocuments are deliberately excluded, since both read as
// HR-internal commentary/files about the employee rather than something to
// expose to them. Access itself is identity-based, not permission-gated -
// see server/routes/auth.ts's /auth/me, which is the only consumer.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

const SELF_VIEW_COLUMNS = {
  id: schema.employees.id,
  fullName: schema.employees.fullName,
  employeeId: schema.employees.employeeId,
  division: schema.employees.division,
  role: schema.employees.role,
  employmentType: schema.employees.employmentType,
  status: schema.employees.status,
  joiningDate: schema.employees.joiningDate,
  monthlySalary: schema.employees.monthlySalary,
  phone: schema.employees.phone,
  email: schema.employees.email,
  aadharNumber: schema.employees.aadharNumber,
  panNumber: schema.employees.panNumber,
  bloodGroup: schema.employees.bloodGroup,
  emergencyContactName: schema.employees.emergencyContactName,
  emergencyContactPhone: schema.employees.emergencyContactPhone,
  address: schema.employees.address,
  policeVerificationStatus: schema.employees.policeVerificationStatus,
  idProofUrl: schema.employees.idProofUrl,
  contractUrl: schema.employees.contractUrl,
  policeVerificationUrl: schema.employees.policeVerificationUrl,
  healthRecordUrl: schema.employees.healthRecordUrl,
  aadharUrl: schema.employees.aadharUrl,
  panUrl: schema.employees.panUrl,
  offerLetterUrl: schema.employees.offerLetterUrl,
  photoUrl: schema.employees.photoUrl,
};

export async function getSelfEmployeeView(userId: number) {
  await ready();
  const [row] = await db.select(SELF_VIEW_COLUMNS).from(schema.employees).where(eq(schema.employees.userId, userId));
  if (!row) return null;
  const payrollRecords = await db
    .select({ month: schema.payrollRecords.month, grossSalary: schema.payrollRecords.grossSalary })
    .from(schema.payrollRecords)
    .where(eq(schema.payrollRecords.employeeId, row.id));
  return { ...row, payrollRecords };
}

/** "Who's on my team" - other employees in the same division, name/role/
 *  status only. No contact info, salary, or documents - this is visible to
 *  coworkers, not just the employee themselves, so it's a much narrower cut
 *  than getSelfEmployeeView. Terminated employees are excluded - a roster
 *  reflects current staff. */
export async function getDepartmentRoster(userId: number) {
  await ready();
  const [self] = await db.select({ id: schema.employees.id, division: schema.employees.division })
    .from(schema.employees).where(eq(schema.employees.userId, userId));
  if (!self || !self.division) return [];

  const rows = await db.select({
    id: schema.employees.id,
    fullName: schema.employees.fullName,
    role: schema.employees.role,
    employmentType: schema.employees.employmentType,
    status: schema.employees.status,
  }).from(schema.employees).where(eq(schema.employees.division, self.division));

  return rows
    .filter((r) => r.id !== self.id && r.status !== 'Terminated')
    .map(({ id: _id, ...rest }) => rest);
}
