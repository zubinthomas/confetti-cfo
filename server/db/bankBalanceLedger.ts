// Bank balance ledger: append-only point-in-time balance snapshots per
// account, plus the position/forecast computation that reads them - the
// reason this isn't a generic entity like bank_accounts itself
// (server/db.ts). Unlike inventory, accounts aren't division-scoped - cash
// position is a company-wide figure, so there's no equivalent of
// getUserDivisionScope here.
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class CashError extends Error {}

export async function listEntries(accountId: string) {
  await ready();
  return db
    .select({
      id: schema.bankBalanceEntries.id,
      createdDate: schema.bankBalanceEntries.createdDate,
      asOfDate: schema.bankBalanceEntries.asOfDate,
      balance: schema.bankBalanceEntries.balance,
      note: schema.bankBalanceEntries.note,
      recordedBy: schema.users.fullName,
      recordedByEmail: schema.users.email,
    })
    .from(schema.bankBalanceEntries)
    .leftJoin(schema.users, eq(schema.users.id, schema.bankBalanceEntries.recordedByUserId))
    .where(eq(schema.bankBalanceEntries.accountId, accountId))
    .orderBy(desc(schema.bankBalanceEntries.asOfDate), desc(schema.bankBalanceEntries.createdDate));
}

/** No update/delete counterpart, by design - this table is append-only,
 *  same philosophy as inventory_transactions. Correcting a mistaken balance
 *  means recording a new entry, not rewriting history. */
export async function recordEntry(userId: number, accountId: string, input: { asOfDate: string; balance: number; note?: string | null }) {
  await ready();
  const [account] = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.id, accountId));
  if (!account) throw new CashError(`No bank account with id ${accountId}`);
  const { asOfDate, balance, note } = input;
  if (!asOfDate || typeof asOfDate !== 'string') throw new CashError('asOfDate is required');
  if (!Number.isFinite(balance)) throw new CashError('balance must be a number');

  const [row] = await db.insert(schema.bankBalanceEntries).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    accountId,
    asOfDate,
    balance,
    note: note || null,
    recordedByUserId: userId,
  }).returning();
  return row;
}

/** Latest (by asOfDate, tie-broken by createdDate) balance entry per active
 *  account, split into available vs. restricted by the account's own flag -
 *  the input to both the Cash Flow page's KPI cards and the forecast below. */
export async function computePosition() {
  await ready();
  const accounts = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.isActive, true));
  const entries = await db
    .select()
    .from(schema.bankBalanceEntries)
    .orderBy(desc(schema.bankBalanceEntries.asOfDate), desc(schema.bankBalanceEntries.createdDate));

  const latestByAccount = new Map<string, typeof entries[number]>();
  for (const entry of entries) {
    if (!latestByAccount.has(entry.accountId)) latestByAccount.set(entry.accountId, entry);
  }

  let available = 0;
  let restricted = 0;
  const accountPositions = accounts.map((account) => {
    const latest = latestByAccount.get(account.id) ?? null;
    const balance = latest?.balance ?? 0;
    if (account.isRestricted) restricted += balance; else available += balance;
    return {
      id: account.id,
      name: account.name,
      accountType: account.accountType,
      isRestricted: account.isRestricted,
      restrictionNote: account.restrictionNote,
      balance,
      asOfDate: latest?.asOfDate ?? null,
    };
  });

  return { available, restricted, total: available + restricted, accounts: accountPositions };
}
