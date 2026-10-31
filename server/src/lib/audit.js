import { db } from '../db/index.js';

// Call inside the same transaction as the change, so a rolled-back change
// leaves no audit row behind.
export function recordAudit(actor, action, entity, entityId, details) {
  db.prepare(
    'INSERT INTO audit_log (actor_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
  ).run(actor?.id ?? null, action, entity, entityId ?? null, details ? JSON.stringify(details) : null);
}
