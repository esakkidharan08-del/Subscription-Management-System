import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { withTransaction } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import { consoleMailer } from '../lib/mailer.js';

const PUBLIC_FIELDS = 'id, email, name, role, created_at';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function findUser(db, id) {
  return db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id);
}

export async function createUser(db, { name, email, password, role }) {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new AppError(409, 'An account with this email already exists');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
    .run(email, passwordHash, name, role);
  return findUser(db, lastInsertRowid);
}

export async function verifyLogin(db, { email, password }) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const valid = user && (await bcrypt.compare(password, user.password_hash));
  if (!valid) throw new AppError(401, 'Email or password is incorrect');
  return findUser(db, user.id);
}

// Responds the same way whether or not the email exists, so accounts can't be discovered.
export async function requestPasswordReset(db, email, mailer = consoleMailer) {
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  if (!user) return;

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.resetTokenMinutes * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    user.id,
    hashToken(token),
    expiresAt,
  );

  await mailer.send({
    to: user.email,
    subject: 'Reset your password',
    text: `Open this link within ${config.resetTokenMinutes} minutes:\n${config.clientUrl}/reset-password?token=${token}`,
  });
}

export async function resetPassword(db, { token, password }) {
  const now = new Date().toISOString();
  const reset = db
    .prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .get(hashToken(token), now);
  if (!reset) throw new AppError(400, 'This reset link is invalid or has expired');

  const passwordHash = await bcrypt.hash(password, 10);
  withTransaction(db, () => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, reset.id);
  });
}
