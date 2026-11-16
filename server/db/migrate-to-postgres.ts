// One-time PGlite -> real Postgres data migration tool. Two independent
// subcommands, meant to be run and checked separately - not one opaque
// script, given the "zero data loss" bar for this migration (see the
// Postgres-migration plan).
//
//   node db/migrate-to-postgres.ts dump --data-dir <pglite-dir> --out <file.sql>
//   node db/migrate-to-postgres.ts load --sql <file.sql> --target-url <DATABASE_URL>
//
// dump opens the PGlite data dir directly (not via client.ts, to skip its
// lockfile/migration dance) and runs a real pg_dump - via
// @electric-sql/pglite-tools' WASM build - against it, producing a plain,
// portable, INSERT-based SQL dump. load runs that dump through psql against
// a real Postgres server. Only ever run `dump` against a data directory no
// other process has open: PGlite is strictly single-process (see
// client.ts's header comment) - stop the app first.
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgDump } from '@electric-sql/pglite-tools/pg_dump';

const execFileAsync = promisify(execFile);

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

async function dump(args: string[]) {
  const dataDir = flag(args, 'data-dir');
  const out = flag(args, 'out');
  if (!dataDir || !out) {
    fail('usage: node db/migrate-to-postgres.ts dump --data-dir <pglite-dir> --out <file.sql>');
  }

  console.log(`Opening ${dataDir}...`);
  const pg = await PGlite.create({ dataDir, extensions: { btree_gist } });
  try {
    console.log('Running pg_dump (WASM)...');
    const file = await pgDump({ pg });
    const text: string = await file.text();
    await fs.writeFile(out, text);

    const counts = new Map<string, number>();
    for (const m of text.matchAll(/^INSERT INTO (?:"?public"?\.)?"?(\w+)"?/gm)) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    console.log(`\nWrote ${out} (${(text.length / 1024 / 1024).toFixed(1)} MB).`);
    console.log(`Row counts seen in the dump (${counts.size} tables):`);
    for (const [table, n] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ${table}: ${n}`);
    }
  } finally {
    await pg.close();
  }
}

async function load(args: string[]) {
  const sql = flag(args, 'sql');
  const targetUrl = flag(args, 'target-url');
  if (!sql || !targetUrl) {
    fail('usage: node db/migrate-to-postgres.ts load --sql <file.sql> --target-url <DATABASE_URL>');
  }

  console.log(`Loading ${sql} into ${targetUrl}...`);
  await execFileAsync('psql', [
    targetUrl,
    '-v', 'ON_ERROR_STOP=1',
    '-c', 'SET search_path TO public;',
    '-f', sql,
  ]);
  console.log('\n✅ Loaded. The target database now holds this dump\'s data, including its');
  console.log('already-applied migrations table - starting the app with DATABASE_URL pointed');
  console.log('here should see every migration as already applied, not re-run or re-seed anything.');
}

async function main() {
  const [, , command, ...rest] = process.argv;
  if (command === 'dump') await dump(rest);
  else if (command === 'load') await load(rest);
  else {
    fail(
      'usage:\n' +
      '  node db/migrate-to-postgres.ts dump --data-dir <pglite-dir> --out <file.sql>\n' +
      '  node db/migrate-to-postgres.ts load --sql <file.sql> --target-url <DATABASE_URL>',
    );
  }
}

main().catch((err) => {
  console.error('❌ Migration step failed:', err);
  process.exit(1);
});
