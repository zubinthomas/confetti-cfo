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

function read() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function write(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function assertEntity(entity) {
  if (!VALID_ENTITIES.has(entity)) throw new Error(`Unknown entity: ${entity}`);
}

function tables(db) {
  if (!db.appEntities) db.appEntities = {};
  for (const name of VALID_ENTITIES) {
    if (!db.appEntities[name]) db.appEntities[name] = [];
  }
  return db.appEntities;
}

export function listEntities(entity, sort) {
  assertEntity(entity);
  const items = tables(read())[entity];
  if (!sort) return items;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...items].sort((a, b) => {
    if ((a[field] ?? '') < (b[field] ?? '')) return desc ? 1 : -1;
    if ((a[field] ?? '') > (b[field] ?? '')) return desc ? -1 : 1;
    return 0;
  });
}

export function createEntity(entity, data) {
  assertEntity(entity);
  const db = read();
  const item = { id: randomUUID(), created_date: new Date().toISOString(), ...data };
  tables(db)[entity].push(item);
  write(db);
  return item;
}

export function updateEntity(entity, id, data) {
  assertEntity(entity);
  const db = read();
  const items = tables(db)[entity];
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...data };
  write(db);
  return items[idx];
}

export function deleteEntity(entity, id) {
  assertEntity(entity);
  const db = read();
  const items = tables(db)[entity];
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  write(db);
  return true;
}
