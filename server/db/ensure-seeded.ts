// Seed the database only if it is empty (used before the e2e web server
// starts, so a developer's entity rows are never wiped by a test run).
//   node db/ensure-seeded.ts
import { sql } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { seed } from './seed.ts';

await ready();
const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.businesses);
if (n === 0) {
  console.log('database empty — seeding from extracted_data.json');
  await seed();
} else {
  console.log(`database already seeded (${n} businesses) — leaving as is`);
}
process.exit(0);
