// One-off seed: gives the "Leadership" role the overview it used to get from a
// role-name check in the client (the Leadership Command Centre widgets shown,
// the Group ones hidden). The overview no longer looks at role names, so run
// this once per database or Leadership accounts will see the Group overview.
//
// Run per database: `npm run db:seed-leadership-layout` with the server
// stopped (PGlite is single-process - see client.ts). Safe to re-run: a role
// that already has a saved layout is left exactly as it is, so an admin's
// later edits survive. Pass --force to overwrite it with the preset.
//
// The preset is the client's own file (src/lib/layout/presets/leadership.json)
// so the two can't drift; a client test checks it against the widget registry.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { validateLayout } from './layouts.ts';

const ROLE_NAME = 'Leadership';
const PRESET = new URL('../../src/lib/layout/presets/leadership.json', import.meta.url);

export type LeadershipSeedResult = 'created' | 'replaced' | 'kept' | 'no-role';

export async function applyLeadershipLayoutSeed(force = false): Promise<LeadershipSeedResult> {
  await ready();
  const config = validateLayout(JSON.parse(readFileSync(PRESET, 'utf8')));
  const [role] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.name, ROLE_NAME));
  if (!role) return 'no-role';

  const [existing] = await db.select({ id: schema.roleLayouts.id }).from(schema.roleLayouts)
    .where(eq(schema.roleLayouts.roleId, role.id));
  if (existing && !force) return 'kept';

  const updatedAt = new Date().toISOString();
  await db.insert(schema.roleLayouts)
    .values({ roleId: role.id, config, updatedAt })
    .onConflictDoUpdate({ target: schema.roleLayouts.roleId, set: { config, updatedAt, updatedByUserId: null } });
  return existing ? 'replaced' : 'created';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await applyLeadershipLayoutSeed(process.argv.includes('--force'));
  const message: Record<LeadershipSeedResult, string> = {
    created: `Saved the overview layout for the "${ROLE_NAME}" role.`,
    replaced: `Replaced the existing "${ROLE_NAME}" role layout with the preset.`,
    kept: `"${ROLE_NAME}" already has a saved layout, left as it is (use --force to overwrite).`,
    'no-role': `No role named "${ROLE_NAME}" in this database, nothing to do.`,
  };
  console.log(message[result]);
  process.exit(0);
}
