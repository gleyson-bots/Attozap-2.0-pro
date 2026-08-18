import type { AttozapDatabase } from '../database.js';
import type { MessageDeliveryStatus } from './provider.js';

export type StoredDeliveryStatus = 'pending' | MessageDeliveryStatus;

const statusRank: Record<StoredDeliveryStatus, number> = {
  pending: 0,
  failed: -1,
  sent: 1,
  delivered: 2,
  read: 3,
  played: 4,
};

export function isConfirmedDelivery(status?: string | null) {
  return status === 'sent' || status === 'delivered' || status === 'read' || status === 'played';
}

export function mergeDeliveryStatus(current: string | undefined | null, next: StoredDeliveryStatus): StoredDeliveryStatus {
  if (current === 'failed') return 'failed';
  if (next === 'failed') return 'failed';
  const currentStatus = (current && current in statusRank ? current : 'pending') as StoredDeliveryStatus;
  return statusRank[next] >= statusRank[currentStatus] ? next : currentStatus;
}

export function cacheMessageStatus(
  db: AttozapDatabase,
  accountId: string,
  messageId: string,
  status: MessageDeliveryStatus,
  error?: string,
) {
  const existing = db.prepare(`
    SELECT status,error FROM message_status_cache
    WHERE account_id=? AND message_id=? LIMIT 1
  `).get(accountId, messageId) as { status?: string; error?: string | null } | undefined;

  const merged = mergeDeliveryStatus(existing?.status, status);
  const mergedError = merged === 'failed' ? (error ?? existing?.error ?? 'WhatsApp rejeitou a mensagem') : null;
  db.prepare(`
    INSERT INTO message_status_cache (account_id,message_id,status,error,updated_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(account_id,message_id) DO UPDATE SET
      status=excluded.status,
      error=excluded.error,
      updated_at=CURRENT_TIMESTAMP
  `).run(accountId, messageId, merged, mergedError);
  return { status: merged, error: mergedError ?? undefined };
}

export function getCachedMessageStatus(db: AttozapDatabase, accountId: string, messageId: string) {
  return db.prepare(`
    SELECT status,error,updated_at FROM message_status_cache
    WHERE account_id=? AND message_id=? LIMIT 1
  `).get(accountId, messageId) as { status: StoredDeliveryStatus; error?: string | null; updated_at?: string } | undefined;
}
