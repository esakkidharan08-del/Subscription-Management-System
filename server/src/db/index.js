import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export function openDatabase(file = config.dbPath) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const database = new DatabaseSync(file);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec(fs.readFileSync(schemaPath, 'utf8'));
  return database;
}

// Tests swap this for an in-memory database before importing any service.
export let db = openDatabase(process.env.NODE_ENV === 'test' ? ':memory:' : config.dbPath);

export function useDatabase(database) {
  db = database;
}

let savepointCounter = 0;

// Savepoints instead of BEGIN so a service that already runs inside a
// transaction can call another one that opens its own.
export function transaction(work) {
  const name = `sp_${++savepointCounter}`;
  db.exec(`SAVEPOINT ${name}`);
  try {
    const result = work();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (err) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw err;
  }
}
