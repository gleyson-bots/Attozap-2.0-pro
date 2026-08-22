import { randomBytes, randomUUID } from 'node:crypto';
import { db, ensureSchema, safeJson } from './db.js';

let platformSchemaPromise;

const schema = [
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_password_reset_expiry ON password_reset_tokens(expires_at,used_at)`,
  `CREATE TABLE IF NOT EXISTS referral_codes (
    user_id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_user_id TEXT NOT NULL,
    referred_user_id TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'signup',
    qualified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(referred_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id,status,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS referral_rewards (
    id TEXT PRIMARY KEY,
    referral_id TEXT NOT NULL UNIQUE,
    referrer_user_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 1000,
    status TEXT NOT NULL DEFAULT 'pending',
    available_at TEXT,
    paid_at TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
    FOREIGN KEY(referrer_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards(referrer_user_id,status,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

export async function ensurePlatformSchema() {
  if (!platformSchemaPromise) platformSchemaPromise = (async () => {
    await ensureSchema();
    const conn = db();
    await conn.batch(schema.map(sql => ({ sql, args: [] })), 'write');
    await conn.execute({
      sql: `INSERT OR IGNORE INTO app_settings (key,value_json) VALUES ('referral_reward_cents',?)`,
      args: [JSON.stringify(Number(process.env.REFERRAL_REWARD_CENTS || 1000))],
    });
  })().catch(error => { platformSchemaPromise = undefined; throw error; });
  return platformSchemaPromise;
}

export async function getSetting(key, fallback = null) {
  await ensurePlatformSchema();
  const row = (await db().execute({ sql: `SELECT value_json FROM app_settings WHERE key=? LIMIT 1`, args: [String(key)] })).rows[0];
  return row ? safeJson(row.value_json, fallback) : fallback;
}

export async function setSetting(key, value) {
  await ensurePlatformSchema();
  await db().execute({
    sql: `INSERT INTO app_settings (key,value_json,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=CURRENT_TIMESTAMP`,
    args: [String(key), JSON.stringify(value)],
  });
}

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function newId(prefix) {
  return `${prefix}_${randomUUID()}`;
}
