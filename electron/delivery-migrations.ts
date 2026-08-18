import type { AttozapDatabase } from './database.js';

export function applyDeliveryMigrations(db: AttozapDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_status_cache (
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id,message_id),
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaign_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      recipient_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id,message_id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY(recipient_id) REFERENCES campaign_recipients(id) ON DELETE CASCADE,
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_message_status_cache_updated
      ON message_status_cache(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_recipient
      ON campaign_deliveries(recipient_id,id);
    CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign_status
      ON campaign_deliveries(campaign_id,status);
  `);
}
