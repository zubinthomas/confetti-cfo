// One-off: the Cafe business unit "Dinning Room" is spelled "Dining Room"
// everywhere else (cost-centre master, step 4). Renames the database row.
//
// Run per database with the server stopped (PGlite is single-process, see
// client.ts), after taking a backup:
//   node db/rename-cafe-dining-room.ts
// Safe to re-run. It does nothing if the old row is gone, and it refuses to
// touch the database if a "Dining Room" row already exists for the Cafe
// business, because merging two units' records is a decision for a person.
//
// The importer (merge.ts UNIT_NAME_ALIASES) and the outlet lookup both accept
// either spelling, so this can run before or after the code is deployed.
import { pathToFileURL } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

const OLD_NAME = 'Dinning Room';
const NEW_NAME = 'Dining Room';

export type RenameResult =
  | { status: 'renamed'; unitId: number }
  | { status: 'nothing-to-do'; reason: string }
  | { status: 'conflict'; reason: string };

export async function renameCafeDiningRoom(): Promise<RenameResult> {
  await ready();
  const [cafe] = await db.select().from(schema.businesses).where(eq(schema.businesses.name, 'Cafe'));
  if (!cafe) return { status: 'nothing-to-do', reason: 'No Cafe business in this database.' };

  const named = (name: string) => db.select().from(schema.businessUnits)
    .where(and(eq(schema.businessUnits.businessId, cafe.id), eq(schema.businessUnits.name, name)));
  const [oldRow] = await named(OLD_NAME);
  const [newRow] = await named(NEW_NAME);

  if (!oldRow) {
    return { status: 'nothing-to-do', reason: newRow ? `Already named "${NEW_NAME}".` : `No "${OLD_NAME}" unit under Cafe.` };
  }
  if (newRow) {
    return {
      status: 'conflict',
      reason: `Cafe has both "${OLD_NAME}" (id ${oldRow.id}) and "${NEW_NAME}" (id ${newRow.id}). `
        + 'Their records need merging by hand, nothing was changed.',
    };
  }
  await db.update(schema.businessUnits).set({ name: NEW_NAME }).where(eq(schema.businessUnits.id, oldRow.id));
  return { status: 'renamed', unitId: oldRow.id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await renameCafeDiningRoom();
  if (r.status === 'renamed') console.log(`Renamed Cafe unit ${r.unitId}: "${OLD_NAME}" -> "${NEW_NAME}".`);
  else console.log(`${r.status}: ${r.reason}`);
  process.exit(r.status === 'conflict' ? 1 : 0);
}
