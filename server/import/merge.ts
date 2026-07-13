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
import { classifyLineItem, type ParsedWorkbook } from './types.ts';

export interface TableStats { creates: number; updates: number; unchanged: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface MergePlan {
  stats: Record<string, TableStats>;
  ops: ((tx: Tx) => Promise<void>)[]; // executed inside one transaction by commit()
}

const stat = (): TableStats => ({ creates: 0, updates: 0, unchanged: 0 });

export async function buildMergePlan(parsed: ParsedWorkbook): Promise<MergePlan> {
  await ready();
  const stats: Record<string, TableStats> = {
    businesses: stat(), businessUnits: stat(), periods: stat(), lineItems: stat(),
    categories: stat(), channels: stat(), vendors: stat(),
    financialRecords: stat(), salesRecords: stat(), consignmentRecords: stat(),
  };
  const inserts: { table: keyof typeof schema; rows: Record<string, unknown>[] }[] = [];
  const updates: { table: keyof typeof schema; id: number; set: Record<string, unknown> }[] = [];

  // ── current db state ────────────────────────────────────────────────────────
  const [businesses, units, periods, lineItems, categories, channels, vendors,
    finRecords, salesRecords, conRecords] = await Promise.all([
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

  // ── dimension resolution (create-if-missing, never mutate existing) ────────
  const businessByName = new Map(businesses.map((b) => [b.name, b.id]));
  const businessId = (() => {
    const existing = businessByName.get(parsed.businessName);
    if (existing != null) { stats.businesses.unchanged++; return existing; }
    const id = nextBusiness();
    inserts.push({ table: 'businesses', rows: [{
      id, name: parsed.businessName,
      slug: parsed.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: `${parsed.businessName} (created by workbook import)`,
    }] });
    stats.businesses.creates++;
    return id;
  })();

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
    financialRecords: [], salesRecords: [], consignmentRecords: [],
  };

  const resolveUnit = (name: string, unitType: 'department' | 'outlet') => {
    const k = unitKey(businessId, name);
    let id = unitIds.get(k);
    if (id == null) {
      id = nextUnit();
      unitIds.set(k, id);
      pendingRows.businessUnits.push({ id, businessId, name, unitType });
      stats.businessUnits.creates++;
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
    const existing = finByKey.get(`${unitId}|${periodId}|${lineItemId}`);
    if (!existing) {
      pendingRows.financialRecords.push({ id: nextFin(), businessUnitId: unitId, periodId, lineItemId, value: r.value, notes: null });
      stats.financialRecords.creates++;
    } else if (!Object.is(existing.value, r.value)) {
      updates.push({ table: 'financialRecords', id: existing.id, set: { value: r.value } });
      stats.financialRecords.updates++;
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
    const existing = salesByKey.get(`${periodId}|${categoryId ?? ''}|${channelId}`);
    if (!existing) {
      pendingRows.salesRecords.push({ id: nextSales(), periodId, categoryId, channelId, businessUnitId: null, amount: r.amount });
      stats.salesRecords.creates++;
    } else if (!Object.is(existing.amount, r.amount)) {
      updates.push({ table: 'salesRecords', id: existing.id, set: { amount: r.amount } });
      stats.salesRecords.updates++;
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
    const existing = conByKey.get(`${periodId}|${vendorId}`);
    if (!existing) {
      pendingRows.consignmentRecords.push({ id: nextCon(), periodId, vendorId, amount: r.amount, commissionRate: r.commissionRate });
      stats.consignmentRecords.creates++;
    } else if (!Object.is(existing.amount, r.amount) || !Object.is(existing.commissionRate, r.commissionRate)) {
      updates.push({ table: 'consignmentRecords', id: existing.id, set: { amount: r.amount, commissionRate: r.commissionRate } });
      stats.consignmentRecords.updates++;
    } else {
      stats.consignmentRecords.unchanged++;
    }
  }

  // fill unchanged counts for dimensions we touched
  stats.businessUnits.unchanged = new Set(parsed.financialRecords.map((r) => r.unitName)).size - stats.businessUnits.creates;
  stats.lineItems.unchanged = new Set(parsed.financialRecords.map((r) => `${r.lineItemName}|${r.valueType}`)).size - stats.lineItems.creates;

  const INSERT_ORDER: (keyof typeof pendingRows)[] = [
    'businessUnits', 'periods', 'lineItems', 'categories', 'channels', 'vendors',
    'financialRecords', 'salesRecords', 'consignmentRecords',
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

  return { stats, ops };
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
