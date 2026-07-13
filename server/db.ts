// Entity storage. App entities (HR & compliance records) live in the
// `appEntities` section of src/data/extracted_data.json, so that file is the
// single data store for the whole app — the dashboards read its financial
// tables directly (via src/data/financialData.js) and this module gives the
// Express API read/write access to the entity tables.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'src', 'data', 'extracted_data.json');

const VALID_ENTITIES = new Set(['Employee', 'Licence', 'Recruitment', 'LeaveRequest']);

interface EntityRow {
  id: string;
  created_date: string;
  [field: string]: unknown;
}

interface Db {
  appEntities?: Record<string, EntityRow[]>;
  [table: string]: unknown;
}

function read(): Db {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function write(db: Db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function assertEntity(entity: string) {
  if (!VALID_ENTITIES.has(entity)) throw new Error(`Unknown entity: ${entity}`);
}

function tables(db: Db): Record<string, EntityRow[]> {
  if (!db.appEntities) db.appEntities = {};
  for (const name of VALID_ENTITIES) {
    if (!db.appEntities[name]) db.appEntities[name] = [];
  }
  return db.appEntities;
}

export function listEntities(entity: string, sort?: string) {
  assertEntity(entity);
  const items = tables(read())[entity];
  if (!sort) return items;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...items].sort((a, b) => {
    if (((a[field] ?? '') as string) < ((b[field] ?? '') as string)) return desc ? 1 : -1;
    if (((a[field] ?? '') as string) > ((b[field] ?? '') as string)) return desc ? -1 : 1;
    return 0;
  });
}

export function createEntity(entity: string, data: Record<string, unknown>) {
  assertEntity(entity);
  const db = read();
  const item = { id: randomUUID(), created_date: new Date().toISOString(), ...data };
  tables(db)[entity].push(item);
  write(db);
  return item;
}

export function updateEntity(entity: string, id: string, data: Record<string, unknown>) {
  assertEntity(entity);
  const db = read();
  const items = tables(db)[entity];
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...data };
  write(db);
  return items[idx];
}

export function deleteEntity(entity: string, id: string) {
  assertEntity(entity);
  const db = read();
  const items = tables(db)[entity];
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  write(db);
  return true;
}
