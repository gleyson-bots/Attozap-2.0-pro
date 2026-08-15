import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS licenses (
      license_id TEXT PRIMARY KEY,
      encoded_license TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      expires_at TEXT,
      validation_status TEXT NOT NULL,
      last_validated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disconnected',
      phone TEXT,
      proxy_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      name TEXT,
      variables_json TEXT,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      is_friendly INTEGER NOT NULL DEFAULT 0,
      wa_exists INTEGER,
      last_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'contact',
      message_template TEXT,
      attachments_json TEXT,
      options_json TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      total INTEGER NOT NULL DEFAULT 0,
      sent INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      target TEXT NOT NULL,
      name TEXT,
      variables_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      message_id TEXT,
      sent_at TEXT,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      executed_at TEXT,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS auto_reply_rules (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      match_type TEXT NOT NULL,
      trigger_text TEXT NOT NULL,
      response_text TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS group_cache (
      account_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      member_count INTEGER NOT NULL DEFAULT 0,
      owner TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id, group_id),
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_contacts_lists ON contacts(is_blocked, is_friendly);
    CREATE INDEX IF NOT EXISTS idx_campaign_status ON campaigns(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipients_campaign_status ON campaign_recipients(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(status, run_at);
    CREATE INDEX IF NOT EXISTS idx_auto_reply_account ON auto_reply_rules(account_id, enabled, priority DESC);
  `);

  ensureColumn(db, 'instances', 'proxy_url', 'TEXT');
  return db;
}

export type AttozapDatabase = ReturnType<typeof openDatabase>;
