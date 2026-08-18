import type { AttozapDatabase } from '../database.js';
import type { MessageDeliveryStatus } from '../messaging/provider.js';
import { getCachedMessageStatus, isConfirmedDelivery, mergeDeliveryStatus, type StoredDeliveryStatus } from '../messaging/status.js';

const successRank: Record<string, number> = { sent: 1, delivered: 2, read: 3, played: 4 };

export function recomputeCampaign(db: AttozapDatabase, campaignId: string) {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('sent','delivered','read','played') THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped,
      SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) AS unresolved
    FROM campaign_recipients WHERE campaign_id=?
  `).get(campaignId) as { total?: number; sent?: number; failed?: number; skipped?: number; unresolved?: number };

  const sent = Number(counts?.sent ?? 0);
  const failed = Number(counts?.failed ?? 0);
  const skipped = Number(counts?.skipped ?? 0);
  const unresolved = Number(counts?.unresolved ?? 0);
  db.prepare(`UPDATE campaigns SET sent=?,failed=?,skipped=? WHERE id=?`).run(sent, failed, skipped, campaignId);

  const campaign = db.prepare(`SELECT status FROM campaigns WHERE id=? LIMIT 1`).get(campaignId) as { status?: string } | undefined;
  if (campaign?.status === 'awaiting_ack' && unresolved === 0) {
    const finalStatus = failed > 0 ? 'failed' : 'completed';
    db.prepare(`UPDATE campaigns SET status=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(finalStatus, campaignId);
  }
  return { total: Number(counts?.total ?? 0), sent, failed, skipped, unresolved };
}

function aggregateRecipientStatus(rows: Array<{ status?: string; error?: string | null }>) {
  const failed = rows.find(row => row.status === 'failed');
  if (failed) return { status: 'failed', error: failed.error ?? 'WhatsApp rejeitou uma parte do envio' };
  if (rows.some(row => row.status === 'pending')) return { status: 'pending', error: undefined };
  const successful = rows.filter(row => isConfirmedDelivery(row.status));
  if (!successful.length) return { status: 'pending', error: undefined };
  let minimum = successful[0].status!;
  for (const row of successful) {
    if ((successRank[row.status ?? ''] ?? 0) < (successRank[minimum] ?? 0)) minimum = row.status!;
  }
  return { status: minimum, error: undefined };
}

export function reconcileCampaignRecipient(db: AttozapDatabase, recipientId: number) {
  const recipient = db.prepare(`SELECT campaign_id,status FROM campaign_recipients WHERE id=? LIMIT 1`).get(recipientId) as { campaign_id?: string; status?: string } | undefined;
  if (!recipient?.campaign_id || recipient.status === 'skipped') return undefined;
  const deliveries = db.prepare(`
    SELECT status,error FROM campaign_deliveries WHERE recipient_id=? ORDER BY id ASC
  `).all(recipientId) as Array<{ status?: string; error?: string | null }>;
  if (!deliveries.length) return recomputeCampaign(db, recipient.campaign_id);

  const aggregate = aggregateRecipientStatus(deliveries);
  const sentAtSql = isConfirmedDelivery(aggregate.status) ? `COALESCE(sent_at,CURRENT_TIMESTAMP)` : `sent_at`;
  db.prepare(`
    UPDATE campaign_recipients
    SET status=?,error=?,sent_at=${sentAtSql}
    WHERE id=?
  `).run(aggregate.status, aggregate.error ?? null, recipientId);
  return recomputeCampaign(db, recipient.campaign_id);
}

export function prepareRecipientAttempt(db: AttozapDatabase, recipientId: number) {
  const recipient = db.prepare(`SELECT campaign_id FROM campaign_recipients WHERE id=? LIMIT 1`).get(recipientId) as { campaign_id?: string } | undefined;
  if (!recipient?.campaign_id) throw new Error('Destinatário da campanha não encontrado');
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM campaign_deliveries WHERE recipient_id=?`).run(recipientId);
    db.prepare(`UPDATE campaign_recipients SET status='sending',error=NULL,message_id=NULL,sent_at=NULL WHERE id=?`).run(recipientId);
    recomputeCampaign(db, recipient.campaign_id!);
  });
  tx();
}

export function recordCampaignDelivery(db: AttozapDatabase, input: {
  campaignId: string;
  recipientId: number;
  accountId: string;
  messageId: string;
  messageType: string;
}) {
  const cached = getCachedMessageStatus(db, input.accountId, input.messageId);
  const status: StoredDeliveryStatus = cached?.status ?? 'pending';
  db.prepare(`
    INSERT INTO campaign_deliveries
      (campaign_id,recipient_id,account_id,message_id,message_type,status,error,updated_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(account_id,message_id) DO UPDATE SET
      campaign_id=excluded.campaign_id,
      recipient_id=excluded.recipient_id,
      message_type=excluded.message_type,
      status=excluded.status,
      error=excluded.error,
      updated_at=CURRENT_TIMESTAMP
  `).run(input.campaignId, input.recipientId, input.accountId, input.messageId, input.messageType, status, cached?.error ?? null);
  db.prepare(`UPDATE campaign_recipients SET message_id=? WHERE id=?`).run(input.messageId, input.recipientId);
}

export function finalizeRecipientSubmission(db: AttozapDatabase, recipientId: number) {
  const row = db.prepare(`SELECT status FROM campaign_recipients WHERE id=? LIMIT 1`).get(recipientId) as { status?: string } | undefined;
  if (row?.status !== 'sending') return;
  reconcileCampaignRecipient(db, recipientId);
}

export function applyCampaignDeliveryStatus(
  db: AttozapDatabase,
  accountId: string,
  messageId: string,
  status: MessageDeliveryStatus,
  error?: string,
) {
  const delivery = db.prepare(`
    SELECT id,recipient_id,campaign_id,status FROM campaign_deliveries
    WHERE account_id=? AND message_id=? LIMIT 1
  `).get(accountId, messageId) as { id?: number; recipient_id?: number; campaign_id?: string; status?: string } | undefined;
  if (!delivery?.id || !delivery.recipient_id || !delivery.campaign_id) return undefined;

  const merged = mergeDeliveryStatus(delivery.status, status);
  db.prepare(`UPDATE campaign_deliveries SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    merged,
    merged === 'failed' ? (error ?? 'WhatsApp rejeitou a mensagem') : null,
    delivery.id,
  );

  const recipient = db.prepare(`SELECT status FROM campaign_recipients WHERE id=? LIMIT 1`).get(delivery.recipient_id) as { status?: string } | undefined;
  if (recipient?.status !== 'sending') reconcileCampaignRecipient(db, delivery.recipient_id);
  return delivery.campaign_id;
}

export function markCampaignRecipient(db: AttozapDatabase, recipientId: number, status: 'failed' | 'skipped', error?: string) {
  const recipient = db.prepare(`SELECT campaign_id FROM campaign_recipients WHERE id=? LIMIT 1`).get(recipientId) as { campaign_id?: string } | undefined;
  if (!recipient?.campaign_id) return undefined;
  db.prepare(`UPDATE campaign_recipients SET status=?,error=?,sent_at=NULL WHERE id=?`).run(status, error ?? null, recipientId);
  recomputeCampaign(db, recipient.campaign_id);
  return recipient.campaign_id;
}

export function finishCampaignExecution(db: AttozapDatabase, campaignId: string, stopped: boolean) {
  const counts = recomputeCampaign(db, campaignId);
  if (stopped) {
    db.prepare(`UPDATE campaigns SET status='stopped',finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(campaignId);
    return 'stopped';
  }
  if (counts.unresolved > 0) {
    db.prepare(`UPDATE campaigns SET status='awaiting_ack',finished_at=NULL WHERE id=?`).run(campaignId);
    return 'awaiting_ack';
  }
  const status = counts.failed > 0 ? 'failed' : 'completed';
  db.prepare(`UPDATE campaigns SET status=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, campaignId);
  return status;
}
