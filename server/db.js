import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data.json');

const DEFAULTS = {
  users: [],
  Employee: [],
  Licence: [],
  Recruitment: [],
  LeaveRequest: [],
};

function read() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULTS, null, 2));
    return structuredClone(DEFAULTS);
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function write(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── Users ────────────────────────────────────────────────────────────────────

export function findUserByEmail(email) {
  return read().users.find(u => u.email === email) ?? null;
}

export function findUserById(id) {
  return read().users.find(u => u.id === id) ?? null;
}

export function createUser(data) {
  const db = read();
  const user = { id: randomUUID(), created_date: new Date().toISOString(), ...data };
  db.users.push(user);
  write(db);
  return user;
}

export function updateUser(id, updates) {
  const db = read();
  const idx = db.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...updates };
  write(db);
  return db.users[idx];
}

// ── Generic entity CRUD ───────────────────────────────────────────────────────

const VALID_ENTITIES = new Set(['Employee', 'Licence', 'Recruitment', 'LeaveRequest']);

function assertEntity(entity) {
  if (!VALID_ENTITIES.has(entity)) throw new Error(`Unknown entity: ${entity}`);
}

export function listEntities(entity, sort) {
  assertEntity(entity);
  const db = read();
  const items = db[entity] ?? [];
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
  if (!db[entity]) db[entity] = [];
  const item = { id: randomUUID(), created_date: new Date().toISOString(), ...data };
  db[entity].push(item);
  write(db);
  return item;
}

export function updateEntity(entity, id, data) {
  assertEntity(entity);
  const db = read();
  if (!db[entity]) return null;
  const idx = db[entity].findIndex(i => i.id === id);
  if (idx === -1) return null;
  db[entity][idx] = { ...db[entity][idx], ...data };
  write(db);
  return db[entity][idx];
}

export function deleteEntity(entity, id) {
  assertEntity(entity);
  const db = read();
  if (!db[entity]) return false;
  const idx = db[entity].findIndex(i => i.id === id);
  if (idx === -1) return false;
  db[entity].splice(idx, 1);
  write(db);
  return true;
}
