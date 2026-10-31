// schema.sql is the starting point; every later change is appended here and never
// edited, so a database created last week upgrades the same way as a new one.
// SQLite's user_version records how many have run.
export const migrations = [
  // 1. token_version lets a password change log out every other session.
  //    audit_log records who changed money or status, and when.
  `
  ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    actor_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
  CREATE INDEX idx_audit_created ON audit_log(created_at);
  `,

  // 2. Indexes the dashboard's monthly reports group and filter on.
  `
  CREATE INDEX idx_payments_paid_on ON payments(paid_on);
  CREATE INDEX idx_invoices_period_start ON invoices(period_start);
  CREATE INDEX idx_password_resets_user ON password_resets(user_id);
  `,
];

export function runMigrations(database) {
  const { user_version: applied } = database.prepare('PRAGMA user_version').get();

  migrations.slice(applied).forEach((sql, index) => {
    const version = applied + index + 1;
    database.exec('BEGIN');
    try {
      database.exec(sql);
      database.exec(`PRAGMA user_version = ${version}`);
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw new Error(`Migration ${version} failed: ${err.message}`, { cause: err });
    }
  });
}
