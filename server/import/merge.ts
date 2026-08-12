// Resolve a ParsedWorkbook against the database: match every parsed entity to
// an existing row by natural key or allocate a new id, then build an upsert
// plan (creates / value-updates / unchanged) that commit() applies in one
// transaction. Natural keys:
//   business: name · unit: (business, name) · period: (type, start, end)
//   lineItem: (business, name, valueType) · category/channel: (business, name)
//   vendor: (business, name) · financialRecord: (unit, period, lineItem)
//   salesRecord: (period, category, channel) · consignment: (period, vendor)
// Existing rows keep their labels/categories (no churn on re-import); only
// numeric values update, and only when they differ.
import { eq, sql } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { classifyLineItem, type ParsedWorkbook, type RecordChange } from './types.ts';
import { buildEmployeeMergePlan } from './mergeEmployees.ts';

export interface TableStats { creates: number; updates: number; unchanged: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface MergePlan {
  stats: Record<string, TableStats>;
  details: Record<string, RecordChange[]>; // row-level detail behind the stats counts
  ops: ((tx: Tx) => Promise<void>)[]; // executed inside one transaction by commit()
}

const stat = (): TableStats => ({ creates: 0, updates: 0, unchanged: 0 });

export async function buildMergePlan(parsed: ParsedWorkbook): Promise<MergePlan> {
  await ready();
  // HR Mastersheet rows don't belong to any business/unit/period/line-item -
  // running the dimension-resolution below for them would create a
  // meaningless "businesses" row on first import. employees is a flat
  // table with its own id scheme (text/UUID, not merge.ts's integer
  // alloc() counters), so it gets its own small matcher instead.
  if (parsed.kind === 'hr') {
    const plan = await buildEmployeeMergePlan(parsed.employeeRecords);
    return { stats: plan.stats, details: plan.details, ops: plan.ops };
  }
  const stats: Record<string, TableStats> = {
    businesses: stat(), businessUnits: stat(), periods: stat(), lineItems: stat(),
    categories: stat(), channels: stat(), vendors: stat(),
    financialRecords: stat(), salesRecords: stat(), consignmentRecords: stat(), revenueTargets: stat(),
  };
  const details: Record<string, RecordChange[]> = {
    businesses: [], businessUnits: [], periods: [], lineItems: [],
    categories: [], channels: [], vendors: [],
    financialRecords: [], salesRecords: [], consignmentRecords: [], revenueTargets: [],
  };
  const inserts: { table: keyof typeof schema; rows: Record<string, unknown>[] }[] = [];
  const updates: { table: keyof typeof schema; id: number; set: Record<string, unknown> }[] = [];

  // ── current db state ────────────────────────────────────────────────────────
  const [businesses, units, periods, lineItems, categories, channels, vendors,
    finRecords, salesRecords, conRecords, targetRecords] = await Promise.all([
    db.select().from(schema.businesses),
    db.select().from(schema.businessUnits),
    db.select().from(schema.periods),
    db.select().from(schema.lineItems),
    db.select().from(schema.categories),
    db.select().from(schema.channels),
    db.select().from(schema.vendors),
    db.select().from(schema.financialRecords),
    db.select().from(schema.salesRecords),
    db.select().from(schema.consignmentRecords),
    db.select().from(schema.revenueTargets),
  ]);

  const nextId: Record<string, number> = {};
  const alloc = (table: string, rows: { id: number }[]) => {
    nextId[table] = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    return () => nextId[table]++;
  };
  const nextBusiness = alloc('businesses', businesses);
  const nextUnit = alloc('businessUnits', units);
  const nextPeriod = alloc('periods', periods);
  const nextLineItem = alloc('lineItems', lineItems);
  const nextCategory = alloc('categories', categories);
  const nextChannel = alloc('channels', channels);
  const nextVendor = alloc('vendors', vendors);
  const nextFin = alloc('financialRecords', finRecords);
  const nextSales = alloc('salesRecords', salesRecords);
  const nextCon = alloc('consignmentRecords', conRecords);
  const nextTarget = alloc('revenueTargets', targetRecords);

  // ── dimension resolution (create-if-missing, never mutate existing) ────────
  // Target-plan rows have no business (they're period+category only, not
  // scoped to a business/unit) - -1 is an unused sentinel here, never
  // referenced since parsed.financialRecords/salesRecords/consignmentRecords
  // are always empty for the 'target' kind, so resolveUnit/resolveNamed/
  // resolveVendor (the only consumers of businessId) never run.
  const businessByName = new Map(businesses.map((b) => [b.name, b.id]));
  const businessId = parsed.businessName ? (() => {
    const existing = businessByName.get(parsed.businessName);
    if (existing != null) { stats.businesses.unchanged++; return existing; }
    const id = nextBusiness();
    inserts.push({ table: 'businesses', rows: [{
      id, name: parsed.businessName,
      slug: parsed.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: `${parsed.businessName} (created by workbook import)`,
    }] });
    stats.businesses.creates++;
    details.businesses.push({ action: 'create', description: parsed.businessName });
    return id;
  })() : -1;

  const unitKey = (bid: number, name: string) => `${bid}|${name}`;
  const unitIds = new Map(units.map((u) => [unitKey(u.businessId, u.name), u.id]));
  const periodKey = (t: string, s: string, e: string) => `${t}|${s}|${e}`;
  const periodIds = new Map(periods.map((p) => [periodKey(p.periodType, p.startDate, p.endDate), p.id]));
  const liKey = (bid: number, name: string, vt: string) => `${bid}|${name}|${vt}`;
  const liIds = new Map(lineItems.map((l) => [liKey(l.businessId, l.name, l.valueType), l.id]));
  const catIds = new Map(categories.map((c) => [unitKey(c.businessId, c.name), c.id]));
  const chanIds = new Map(channels.map((c) => [unitKey(c.businessId, c.name), c.id]));
  const vendorIds = new Map(vendors.map((v) => [unitKey(v.businessId, v.name), v.id]));

  const pendingRows: Record<string, Record<string, unknown>[]> = {
    businessUnits: [], periods: [], lineItems: [], categories: [], channels: [], vendors: [],
    financialRecords: [], salesRecords: [], consignmentRecords: [], revenueTargets: [],
  };

  const resolveUnit = (name: string, unitType: 'department' | 'outlet') => {
    const k = unitKey(businessId, name);
    let id = unitIds.get(k);
    if (id == null) {
      id = nextUnit();
      unitIds.set(k, id);
      pendingRows.businessUnits.push({ id, businessId, name, unitType });
      stats.businessUnits.creates++;
      details.businessUnits.push({ action: 'create', description: `${name} (${unitType})` });
    }
    return id;
  };
  const resolvePeriod = (p: { periodType: string; startDate: string; endDate: string; label: string; fiscalYear: string; isSpecialEvent: boolean }) => {
    const k = periodKey(p.periodType, p.startDate, p.endDate);
    let id = periodIds.get(k);
    if (id == null) {
      id = nextPeriod();
      periodIds.set(k, id);
      pendingRows.periods.push({ id, ...p });
      stats.periods.creates++;
      details.periods.push({ action: 'create', description: p.label || `${p.startDate}–${p.endDate}` });
    }
    return id;
  };
  const resolveLineItem = (name: string, valueType: 'amount' | 'percentage') => {
    const k = liKey(businessId, name, valueType);
    let id = liIds.get(k);
    if (id == null) {
      id = nextLineItem();
      liIds.set(k, id);
      pendingRows.lineItems.push({
        id, businessId, name, valueType,
        category: classifyLineItem(name, valueType),
        relatedAmountLineItemId: null, displayOrder: null,
      });
      stats.lineItems.creates++;
      details.lineItems.push({ action: 'create', description: `${name} (${valueType})` });
    }
    return id;
  };
  const resolveNamed = (
    map: Map<string, number>, next: () => number, table: 'categories' | 'channels', name: string,
  ) => {
    const k = unitKey(businessId, name);
    let id = map.get(k);
    if (id == null) {
      id = next();
      map.set(k, id);
      pendingRows[table].push({ id, businessId, name });
      stats[table].creates++;
      details[table].push({ action: 'create', description: name });
    }
    return id;
  };
  const resolveVendor = (name: string, group: 'consignment' | 'other_brands', rate: number | null) => {
    const k = unitKey(businessId, name);
    let id = vendorIds.get(k);
    if (id == null) {
      id = nextVendor();
      vendorIds.set(k, id);
      pendingRows.vendors.push({ id, businessId, name, commissionRate: rate, group });
      stats.vendors.creates++;
      details.vendors.push({ action: 'create', description: `${name} (${group})` });
    }
    return id;
  };

  // ── periods declared by the workbook (labels/fiscal years for new ones) ────
  for (const p of parsed.periods) resolvePeriod(p);
  // periods that already exist count as unchanged
  stats.periods.unchanged = parsed.periods.length - stats.periods.creates;

  // ── financial records ───────────────────────────────────────────────────────
  const finByKey = new Map(finRecords.map((r) => [`${r.businessUnitId}|${r.periodId}|${r.lineItemId}`, r]));
  for (const r of parsed.financialRecords) {
    const unitId = resolveUnit(r.unitName, r.unitType);
    const periodId = resolvePeriod({
      periodType: r.periodType, startDate: r.periodStart, endDate: r.periodEnd,
      label: r.periodStart, fiscalYear: '', isSpecialEvent: false, // only used if the parser forgot to declare it
    });
    const lineItemId = resolveLineItem(r.lineItemName, r.valueType);
    const description = `${r.unitName} · ${r.lineItemName} · ${r.periodStart}–${r.periodEnd}`;
    const existing = finByKey.get(`${unitId}|${periodId}|${lineItemId}`);
    if (!existing) {
      pendingRows.financialRecords.push({ id: nextFin(), businessUnitId: unitId, periodId, lineItemId, value: r.value, notes: null });
      stats.financialRecords.creates++;
      details.financialRecords.push({ action: 'create', description, fields: [{ field: 'value', from: null, to: r.value }] });
    } else if (!Object.is(existing.value, r.value)) {
      updates.push({ table: 'financialRecords', id: existing.id, set: { value: r.value } });
      stats.financialRecords.updates++;
      details.financialRecords.push({ action: 'update', description, fields: [{ field: 'value', from: existing.value, to: r.value }] });
    } else {
      stats.financialRecords.unchanged++;
    }
  }

  // ── sales records ───────────────────────────────────────────────────────────
  const salesByKey = new Map(salesRecords.map((r) => [`${r.periodId}|${r.categoryId ?? ''}|${r.channelId}`, r]));
  for (const r of parsed.salesRecords) {
    const periodId = resolvePeriod({
      periodType: r.periodType, startDate: r.periodStart, endDate: r.periodEnd,
      label: r.periodStart, fiscalYear: '', isSpecialEvent: false,
    });
    const categoryId = r.categoryName == null ? null
      : resolveNamed(catIds, nextCategory, 'categories', r.categoryName);
    const channelId = resolveNamed(chanIds, nextChannel, 'channels', r.channelName);
    const description = `${r.categoryName ?? 'All categories'} · ${r.channelName} · ${r.periodStart}–${r.periodEnd}`;
    const existing = salesByKey.get(`${periodId}|${categoryId ?? ''}|${channelId}`);
    if (!existing) {
      pendingRows.salesRecords.push({ id: nextSales(), periodId, categoryId, channelId, businessUnitId: null, amount: r.amount });
      stats.salesRecords.creates++;
      details.salesRecords.push({ action: 'create', description, fields: [{ field: 'amount', from: null, to: r.amount }] });
    } else if (!Object.is(existing.amount, r.amount)) {
      updates.push({ table: 'salesRecords', id: existing.id, set: { amount: r.amount } });
      stats.salesRecords.updates++;
      details.salesRecords.push({ action: 'update', description, fields: [{ field: 'amount', from: existing.amount, to: r.amount }] });
    } else {
      stats.salesRecords.unchanged++;
    }
  }

  // ── consignment records ─────────────────────────────────────────────────────
  const conByKey = new Map(conRecords.map((r) => [`${r.periodId}|${r.vendorId}`, r]));
  for (const r of parsed.consignmentRecords) {
    const periodId = resolvePeriod({
      periodType: r.periodType, startDate: r.periodStart, endDate: r.periodEnd,
      label: r.periodStart, fiscalYear: '', isSpecialEvent: false,
    });
    const vendorId = resolveVendor(r.vendorName, r.vendorGroup, r.commissionRate);
    const description = `${r.vendorName} · ${r.periodStart}–${r.periodEnd}`;
    const existing = conByKey.get(`${periodId}|${vendorId}`);
    const amountChanged = existing != null && !Object.is(existing.amount, r.amount);
    const rateChanged = existing != null && !Object.is(existing.commissionRate, r.commissionRate);
    if (!existing) {
      pendingRows.consignmentRecords.push({ id: nextCon(), periodId, vendorId, amount: r.amount, commissionRate: r.commissionRate });
      stats.consignmentRecords.creates++;
      details.consignmentRecords.push({
        action: 'create', description,
        fields: [
          { field: 'amount', from: null, to: r.amount },
          { field: 'commissionRate', from: null, to: r.commissionRate },
        ],
      });
    } else if (amountChanged || rateChanged) {
      updates.push({ table: 'consignmentRecords', id: existing.id, set: { amount: r.amount, commissionRate: r.commissionRate } });
      stats.consignmentRecords.updates++;
      const fields = [];
      if (amountChanged) fields.push({ field: 'amount', from: existing.amount, to: r.amount });
      if (rateChanged) fields.push({ field: 'commissionRate', from: existing.commissionRate, to: r.commissionRate });
      details.consignmentRecords.push({ action: 'update', description, fields });
    } else {
      stats.consignmentRecords.unchanged++;
    }
  }

  // ── revenue targets ─────────────────────────────────────────────────────────
  const targetsByKey = new Map(targetRecords.map((t) => [`${t.periodId}|${t.category}`, t]));
  for (const r of parsed.targetRecords) {
    const periodId = resolvePeriod({
      periodType: r.periodType, startDate: r.periodStart, endDate: r.periodEnd,
      label: r.periodStart, fiscalYear: '', isSpecialEvent: false,
    });
    const description = `${r.category} target · ${r.periodStart}–${r.periodEnd}`;
    const existing = targetsByKey.get(`${periodId}|${r.category}`);
    if (!existing) {
      pendingRows.revenueTargets.push({ id: nextTarget(), periodId, category: r.category, targetAmount: r.amount });
      stats.revenueTargets.creates++;
      details.revenueTargets.push({ action: 'create', description, fields: [{ field: 'targetAmount', from: null, to: r.amount }] });
    } else if (!Object.is(existing.targetAmount, r.amount)) {
      updates.push({ table: 'revenueTargets', id: existing.id, set: { targetAmount: r.amount } });
      stats.revenueTargets.updates++;
      details.revenueTargets.push({ action: 'update', description, fields: [{ field: 'targetAmount', from: existing.targetAmount, to: r.amount }] });
    } else {
      stats.revenueTargets.unchanged++;
    }
  }

  // fill unchanged counts for dimensions we touched
  stats.businessUnits.unchanged = new Set(parsed.financialRecords.map((r) => r.unitName)).size - stats.businessUnits.creates;
  stats.lineItems.unchanged = new Set(parsed.financialRecords.map((r) => `${r.lineItemName}|${r.valueType}`)).size - stats.lineItems.creates;

  const INSERT_ORDER: (keyof typeof pendingRows)[] = [
    'businessUnits', 'periods', 'lineItems', 'categories', 'channels', 'vendors',
    'financialRecords', 'salesRecords', 'consignmentRecords', 'revenueTargets',
  ];
  const ops: ((tx: Tx) => Promise<void>)[] = [];
  for (const ins of inserts) {
    ops.push(async (tx) => { await tx.insert(schema[ins.table] as never).values(ins.rows as never); });
  }
  for (const table of INSERT_ORDER) {
    const rows = pendingRows[table];
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      ops.push(async (tx) => { await tx.insert(schema[table as keyof typeof schema] as never).values(chunk as never); });
    }
  }
  for (const u of updates) {
    const table = schema[u.table] as typeof schema.financialRecords;
    ops.push(async (tx) => { await tx.update(table).set(u.set as never).where(eq(table.id, u.id)); });
  }

  return { stats, details, ops };
}

export async function commitMergePlan(plan: MergePlan): Promise<void> {
  await ready();
  await db.transaction(async (tx) => {
    for (const op of plan.ops) await op(tx);
  });
}

export async function datasetVersion(): Promise<number> {
  await ready();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.financialRecords);
  return n;
}
