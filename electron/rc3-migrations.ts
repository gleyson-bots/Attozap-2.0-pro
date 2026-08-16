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
