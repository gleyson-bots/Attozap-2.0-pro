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
    CREATE TABLE IF NOT EXISTS license_usage (
      license_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      outbound_count INTEGER NOT NULL DEFAULT 0,
      campaign_starts INTEGER NOT NULL DEFAULT 0,
      ai_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(license_id, usage_date),
      FOREIGN KEY(license_id) REFERENCES licenses(license_id) ON DELETE CASCADE
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
    CREATE TABLE IF NOT EXISTS wa_identities (
      account_id TEXT NOT NULL,
      canonical_jid TEXT NOT NULL,
      lid TEXT,
      pn_jid TEXT,
      phone TEXT,
      push_name TEXT,
      source TEXT,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id, canonical_jid),
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
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
    CREATE TABLE IF NOT EXISTS chat_cache (
      account_id TEXT NOT NULL,
      jid TEXT NOT NULL,
      lid TEXT,
      pn_jid TEXT,
      phone TEXT,
      name TEXT,
      profile_url TEXT,
      is_group INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      first_message_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      PRIMARY KEY(account_id, jid),
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS message_log (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      remote_jid TEXT NOT NULL,
      participant_jid TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('in','out')),
      message_type TEXT NOT NULL DEFAULT 'text',
      text TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      error TEXT,
      media_path TEXT,
      file_name TEXT,
      mimetype TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
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
    CREATE TABLE IF NOT EXISTS group_activity (
      account_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      participant_jid TEXT NOT NULL,
      participant_lid TEXT,
      participant_pn_jid TEXT,
      participant_phone TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      first_message_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      PRIMARY KEY(account_id, group_id, participant_jid),
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS warmup_profiles (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      targets_json TEXT NOT NULL DEFAULT '[]',
      messages_json TEXT NOT NULL DEFAULT '[]',
      min_delay_seconds INTEGER NOT NULL DEFAULT 180,
      max_delay_seconds INTEGER NOT NULL DEFAULT 600,
      daily_limit INTEGER NOT NULL DEFAULT 20,
      active_hour_start INTEGER NOT NULL DEFAULT 9,
      active_hour_end INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'stopped',
      sent_today INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      last_reset_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS warmup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      target_jid TEXT,
      message TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(profile_id) REFERENCES warmup_profiles(id) ON DELETE CASCADE,
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_identity_lid ON wa_identities(account_id, lid) WHERE lid IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_identity_pn ON wa_identities(account_id, pn_jid) WHERE pn_jid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_wa_identity_phone ON wa_identities(account_id, phone);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_license_usage_date ON license_usage(usage_date);
    CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_contacts_lists ON contacts(is_blocked, is_friendly);
    CREATE INDEX IF NOT EXISTS idx_chat_cache_recent ON chat_cache(account_id, is_group, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_message_log_chat ON message_log(account_id, remote_jid, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_campaign_status ON campaigns(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipients_campaign_status ON campaign_recipients(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(status, run_at);
    CREATE INDEX IF NOT EXISTS idx_auto_reply_account ON auto_reply_rules(account_id, enabled, priority DESC);
    CREATE INDEX IF NOT EXISTS idx_group_activity_recent ON group_activity(account_id, group_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_warmup_status ON warmup_profiles(status, account_id);
    CREATE INDEX IF NOT EXISTS idx_warmup_logs ON warmup_logs(profile_id, created_at DESC);
  `);

  ensureColumn(db, 'instances', 'proxy_url', 'TEXT');
  ensureColumn(db, 'chat_cache', 'lid', 'TEXT');
  ensureColumn(db, 'chat_cache', 'pn_jid', 'TEXT');
  ensureColumn(db, 'chat_cache', 'phone', 'TEXT');
  ensureColumn(db, 'group_activity', 'participant_lid', 'TEXT');
  ensureColumn(db, 'group_activity', 'participant_pn_jid', 'TEXT');
  ensureColumn(db, 'group_activity', 'participant_phone', 'TEXT');
  return db;
}

export type AttozapDatabase = ReturnType<typeof openDatabase>;
