// Fidelity proof: reconstruct the extracted_data.json shape from the database
// and deep-compare it with the file. Exits non-zero on any difference.
//   node db/verify.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, loadMeta } from './dataset.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(__dirname, '..', '..', 'src', 'data', 'extracted_data.json');
const raw = JSON.parse(fs.readFileSync(DATASET, 'utf-8'));

const rebuilt: Record<string, unknown> = {
  ...(await loadDataset()),
  _meta: await loadMeta(),
};

// source arrays, ordered by id like the reconstruction
const source: Record<string, unknown> = {};
for (const key of Object.keys(rebuilt)) {
  source[key] = key === '_meta'
    ? raw._meta
    : [...raw[key]].sort((a: { id: number }, b: { id: number }) => a.id - b.id);
}

function diff(a: unknown, b: unknown, at: string, problems: string[]) {
  if (problems.length > 20) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { problems.push(`${at}: length ${a.length} vs ${b.length}`); return; }
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${at}[${i}]`, problems);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`, problems);
    }
    return;
  }
  if (!Object.is(a, b)) problems.push(`${at}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const problems: string[] = [];
diff(source, rebuilt, '$', problems);

if (problems.length) {
  console.error(`FIDELITY FAILED - ${problems.length}+ differences:`);
  for (const p of problems) console.error(' ', p);
  process.exit(1);
}
console.log('FIDELITY OK - database reconstructs extracted_data.json exactly',
  `(${Object.keys(rebuilt).length - 1} tables + _meta)`);
process.exit(0);
