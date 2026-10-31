import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db, transaction } from '../db/index.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { recordAudit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';

const BCRYPT_ROUNDS = 10;

// Compared against when the email is unknown, so a missing account takes
// as long to reject as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function createUser({ name, email, password, role }, actor) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw conflict('An account with this email already exists');

  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hashPassword(password), role);
  const user = publicUser({ id: Number(result.lastInsertRowid), name, email, role });
  if (actor) recordAudit(actor, 'user_created', 'user', user.id, { email, role });
  return user;
}

export function signup({ name, email, password }) {
  return createUser({ name, email, password, role: 'customer' });
}

export function login({ email, password }) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const matches = bcrypt.compareSync(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !matches) throw unauthorized('Email or password is incorrect');
  return publicUser(user);
}

export function findUserById(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return user ? publicUser(user) : null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Always resolves the same way so the response never reveals whether an email is registered.
export async function requestPasswordReset(email) {
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
  if (!user) return;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.resetTokenMinutes * 60 * 1000).toISOString();

  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    user.id,
    hashToken(token),
    expiresAt,
  );

  await sendMail({
    to: email,
    subject: 'Reset your Brightloop Software password',
    text: `Hi ${user.name},\n\nOpen this link to choose a new password:\n${config.clientUrl}/reset-password?token=${token}\n\nIt expires in ${config.resetTokenMinutes} minutes.`,
  });
}

export function resetPassword({ token, password }) {
  transaction(() => {
    const reset = db
      .prepare('SELECT * FROM password_resets WHERE token_hash = ?')
      .get(hashToken(token));

    if (!reset || reset.used_at || reset.expires_at < new Date().toISOString()) {
      throw badRequest('This reset link is invalid or has expired');
    }

    // Burns every outstanding link for this user, not just the one used.
    db.prepare(
      "UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    ).run(reset.user_id);
    setPassword(reset.user_id, password);
    recordAudit({ id: reset.user_id }, 'password_reset', 'user', reset.user_id);
  });
}

// Bumping token_version signs out every session that was issued before the change.
function setPassword(userId, password) {
  db.prepare(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
  ).run(hashPassword(password), userId);
}

export function changePassword(userId, { current_password, new_password }) {
  transaction(() => {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
      throw badRequest('Your current password is incorrect');
    }
    if (bcrypt.compareSync(new_password, user.password_hash)) {
      throw badRequest('Choose a password you have not used just now');
    }
    setPassword(userId, new_password);
    recordAudit({ id: userId }, 'password_changed', 'user', userId);
  });
}
