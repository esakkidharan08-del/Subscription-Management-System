import { db } from '../db/index.js';

// Called inside the same transaction as the insert, and SQLite allows one writer
// at a time, so two records can't be handed the same number.
export function nextNumber(table, prefix) {
  const { next } = db.prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM ${table}`).get();
  return `${prefix}-${String(next).padStart(5, '0')}`;
}
