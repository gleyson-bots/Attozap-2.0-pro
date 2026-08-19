import type { AttozapDatabase } from './database.js';

function ensureColumn(db: AttozapDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function applyRc3Migrations(db: AttozapDatabase) {
  ensureColumn(db, 'chat_cache', 'profile_url', 'TEXT');
  ensureColumn(db, 'message_log', 'media_path', 'TEXT');
  ensureColumn(db, 'message_log', 'file_name', 'TEXT');
  ensureColumn(db, 'message_log', 'mimetype', 'TEXT');
  ensureColumn(db, 'message_log', 'metadata_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'warmup_profiles', 'message_source', "TEXT NOT NULL DEFAULT 'library'");
  ensureColumn(db, 'warmup_profiles', 'ai_provider', 'TEXT');
  ensureColumn(db, 'warmup_profiles', 'ai_model', 'TEXT');
  ensureColumn(db, 'warmup_profiles', 'ai_prompt', 'TEXT');
  ensureColumn(db, 'warmup_profiles', 'ai_daily_limit', 'INTEGER NOT NULL DEFAULT 8');
  ensureColumn(db, 'warmup_profiles', 'mode', "TEXT NOT NULL DEFAULT 'direct'");
  ensureColumn(db, 'warmup_profiles', 'peer_account_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'warmup_profiles', 'round_robin_index', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'warmup_logs', 'source', "TEXT NOT NULL DEFAULT 'library'");
  ensureColumn(db, 'warmup_logs', 'sender_account_id', 'TEXT');
  ensureColumn(db, 'warmup_logs', 'recipient_account_id', 'TEXT');
  ensureColumn(db, 'warmup_logs', 'message_id', 'TEXT');
  ensureColumn(db, 'warmup_logs', 'simulated', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'warmup_logs', 'failure_code', 'INTEGER');
  ensureColumn(db, 'warmup_logs', 'failure_class', 'TEXT');
  ensureColumn(db, 'warmup_profiles', 'simulation_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'warmup_profiles', 'circuit_state', "TEXT NOT NULL DEFAULT 'closed'");
  ensureColumn(db, 'warmup_profiles', 'circuit_open_until', 'TEXT');
  ensureColumn(db, 'warmup_profiles', 'circuit_failures', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'warmup_profiles', 'circuit_breaker_limit', 'INTEGER NOT NULL DEFAULT 3');
  db.prepare(`UPDATE warmup_profiles SET circuit_breaker_limit=3 WHERE circuit_breaker_limit IS NULL OR circuit_breaker_limit=1`).run();
  ensureColumn(db, 'warmup_profiles', 'circuit_breaker_cooldown_minutes', 'INTEGER NOT NULL DEFAULT 60');
  ensureColumn(db, 'campaigns', 'circuit_state', "TEXT NOT NULL DEFAULT 'closed'");
  ensureColumn(db, 'campaigns', 'circuit_open_until', 'TEXT');
  ensureColumn(db, 'campaigns', 'circuit_failures', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'campaigns', 'circuit_breaker_limit', 'INTEGER NOT NULL DEFAULT 3');
  ensureColumn(db, 'campaigns', 'circuit_breaker_cooldown_minutes', 'INTEGER NOT NULL DEFAULT 60');

  db.exec(`
    CREATE TABLE IF NOT EXISTS recruiting_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT,
      location TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS recruiting_candidates (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      source TEXT,
      profile_url TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(job_id) REFERENCES recruiting_jobs(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recruiting_candidates_job ON recruiting_candidates(job_id, status, created_at DESC);
  `);
}
