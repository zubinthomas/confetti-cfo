// Cost-centre master (schema.ts's cost_centres / cost_centre_members). A cost
// centre groups business units, Sienna sales channels and consignment vendors
// for reporting. Nothing in the dashboard's existing rollups reads this yet;
// it is the reviewable mapping that a later, signed-off step builds on.
//
// A target is in one of three states: a member of a centre, deliberately
// excluded (aggregate rows, technical buckets), or undecided (no row at all,
// returned as "unassigned"). Assigning an already-mapped target moves it.
// createdAt / createdByUserId record the latest assignment, not the first.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class CostCentreError extends Error {}

export type MemberKind = 'businessUnit' | 'channel' | 'vendor';

const KIND_COLUMN = {
  businessUnit: 'businessUnitId',
  channel: 'channelId',
  vendor: 'vendorId',
} as const satisfies Record<MemberKind, keyof typeof schema.costCentreMembers.$inferInsert>;

const isKind = (k: unknown): k is MemberKind => typeof k === 'string' && k in KIND_COLUMN;

export interface TargetRef {
  kind: MemberKind;
  targetId: number;
  /** Display name; for business units this is prefixed with the business ("CEPL / Bar"). */
  name: string;
}

export interface CostCentreView {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  members: (TargetRef & { memberId: number })[];
}

export interface CostCentreOverview {
  centres: CostCentreView[];
  excluded: (TargetRef & { memberId: number; reason: string })[];
  unassigned: TargetRef[];
}

/** Resolves every possible target to a display name, keyed by `kind:id`. */
async function loadTargets() {
  const [businesses, units, channels, vendors] = await Promise.all([
    db.select().from(schema.businesses),
    db.select().from(schema.businessUnits),
    db.select().from(schema.channels),
    db.select().from(schema.vendors),
  ]);
  const businessName = new Map(businesses.map((b) => [b.id, b.name]));
  const targets = new Map<string, TargetRef>();
  for (const u of units) {
    targets.set(`businessUnit:${u.id}`, { kind: 'businessUnit', targetId: u.id, name: `${businessName.get(u.businessId) ?? u.businessId} / ${u.name}` });
  }
  for (const c of channels) {
    targets.set(`channel:${c.id}`, { kind: 'channel', targetId: c.id, name: `${businessName.get(c.businessId) ?? c.businessId} / ${c.name}` });
  }
  for (const v of vendors) {
    targets.set(`vendor:${v.id}`, { kind: 'vendor', targetId: v.id, name: `${businessName.get(v.businessId) ?? v.businessId} / ${v.name}` });
  }
  return targets;
}

export async function getOverview(): Promise<CostCentreOverview> {
  await ready();
  const [centres, members, targets] = await Promise.all([
    db.select().from(schema.costCentres).orderBy(schema.costCentres.sortOrder, schema.costCentres.id),
    db.select().from(schema.costCentreMembers),
    loadTargets(),
  ]);

  const views = new Map<number, CostCentreView>(centres.map((c) => [c.id, {
    id: c.id, code: c.code, name: c.name, description: c.description,
    sortOrder: c.sortOrder, isActive: c.isActive, members: [] as CostCentreView['members'],
  }]));
  const excluded: CostCentreOverview['excluded'] = [];
  const decided = new Set<string>();

  for (const m of members) {
    const kind: MemberKind = m.businessUnitId != null ? 'businessUnit' : m.channelId != null ? 'channel' : 'vendor';
    const targetId = (m.businessUnitId ?? m.channelId ?? m.vendorId) as number;
    const key = `${kind}:${targetId}`;
    const ref = targets.get(key);
    if (!ref) continue; // FK guarantees this exists; defensive only
    decided.add(key);
    if (m.costCentreId != null) views.get(m.costCentreId)?.members.push({ ...ref, memberId: m.id });
    else excluded.push({ ...ref, memberId: m.id, reason: m.exclusionReason ?? '' });
  }

  const unassigned = [...targets.entries()].filter(([key]) => !decided.has(key)).map(([, ref]) => ref);
  return { centres: [...views.values()], excluded, unassigned };
}

async function assertTargetExists(kind: MemberKind, targetId: number) {
  const rows = kind === 'businessUnit'
    ? await db.select({ id: schema.businessUnits.id }).from(schema.businessUnits).where(eq(schema.businessUnits.id, targetId))
    : kind === 'channel'
      ? await db.select({ id: schema.channels.id }).from(schema.channels).where(eq(schema.channels.id, targetId))
      : await db.select({ id: schema.vendors.id }).from(schema.vendors).where(eq(schema.vendors.id, targetId));
  if (!rows.length) throw new CostCentreError(`No ${kind} with id ${targetId}`);
}

function parseTarget(kind: unknown, targetId: unknown) {
  if (!isKind(kind)) throw new CostCentreError("kind must be 'businessUnit', 'channel' or 'vendor'");
  const id = Number(targetId);
  if (!Number.isInteger(id) || id <= 0) throw new CostCentreError('targetId must be a positive integer');
  return { kind, targetId: id };
}

/** Insert or move a target's membership. `costCentreId` xor `exclusionReason`. */
async function upsertMembership(
  userId: number,
  target: { kind: MemberKind; targetId: number },
  state: { costCentreId: number; exclusionReason: null } | { costCentreId: null; exclusionReason: string },
) {
  const column = KIND_COLUMN[target.kind];
  const now = new Date().toISOString();
  const [existing] = await db.select({ id: schema.costCentreMembers.id }).from(schema.costCentreMembers)
    .where(eq(schema.costCentreMembers[column], target.targetId));
  if (existing) {
    const [row] = await db.update(schema.costCentreMembers)
      .set({ ...state, createdAt: now, createdByUserId: userId })
      .where(eq(schema.costCentreMembers.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(schema.costCentreMembers)
    .values({ ...state, [column]: target.targetId, createdAt: now, createdByUserId: userId }).returning();
  return row;
}

export async function assignMember(userId: number, input: { kind: unknown; targetId: unknown; costCentreId: unknown }) {
  await ready();
  const target = parseTarget(input.kind, input.targetId);
  const costCentreId = Number(input.costCentreId);
  if (!Number.isInteger(costCentreId) || costCentreId <= 0) throw new CostCentreError('costCentreId must be a positive integer');
  const [centre] = await db.select().from(schema.costCentres).where(eq(schema.costCentres.id, costCentreId));
  if (!centre) throw new CostCentreError(`No cost centre with id ${costCentreId}`);
  if (!centre.isActive) throw new CostCentreError(`Cost centre ${centre.code} is not active`);
  await assertTargetExists(target.kind, target.targetId);
  return upsertMembership(userId, target, { costCentreId, exclusionReason: null });
}

export async function excludeMember(userId: number, input: { kind: unknown; targetId: unknown; reason: unknown }) {
  await ready();
  const target = parseTarget(input.kind, input.targetId);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) throw new CostCentreError('An exclusion needs a reason');
  await assertTargetExists(target.kind, target.targetId);
  return upsertMembership(userId, target, { costCentreId: null, exclusionReason: reason });
}

/** Returns a target to "undecided" by removing its row. */
export async function clearMember(memberId: number) {
  await ready();
  const [deleted] = await db.delete(schema.costCentreMembers)
    .where(eq(schema.costCentreMembers.id, memberId)).returning();
  if (!deleted) throw new CostCentreError(`No cost-centre membership with id ${memberId}`);
  return deleted;
}
