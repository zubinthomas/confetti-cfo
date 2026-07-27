// Ensures a fixed e2e-test user (assigned Admin) exists, for Playwright's
// globalSetup (tests/e2e/global-setup.ts) to log in as before the suite
// runs. Idempotent - safe to run before every e2e run, never wipes anything.
//   node db/ensure-e2e-user.ts
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

// Keep in sync with tests/e2e/global-setup.ts.
const E2E_USER_EMAIL = 'e2e@confetti.test';
const E2E_USER_PASSWORD = 'e2e-test-password';
const ADMIN_ROLE = 'Admin';

await ready();

const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, E2E_USER_EMAIL));
let userId = existing?.id;

if (!existing) {
  const passwordHash = await bcrypt.hash(E2E_USER_PASSWORD, 10);
  const [u] = await db.insert(schema.users).values({
    email: E2E_USER_EMAIL,
    passwordHash,
    fullName: 'E2E Test User',
    createdAt: new Date().toISOString(),
  }).returning();
  userId = u.id;
  console.log(`created e2e user #${u.id} ${u.email}`);
} else {
  console.log(`e2e user already exists: #${existing.id} ${existing.email}`);
}

const [admin] = await db.select().from(schema.roles).where(eq(schema.roles.name, ADMIN_ROLE));
if (admin && userId) {
  await db.insert(schema.userRoles).values({ userId, roleId: admin.id })
    .onConflictDoNothing({ target: [schema.userRoles.userId, schema.userRoles.roleId] });
}

process.exit(0);
