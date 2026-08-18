import type { BrowserWindow } from 'electron';
import type { AttozapDatabase } from './database.js';
import type { AccountManager } from './messaging/account-manager.js';
import type { MessageDeliveryStatus } from './messaging/provider.js';

const rank: Record<string, number> = { pending: 0, failed: 0, sent: 1, delivered: 2, read: 3, played: 4 };

export function registerMessageStatusTracking(input: { window: BrowserWindow; db: AttozapDatabase; accounts: AccountManager }) {
  const { window, db, accounts } = input;
  accounts.on('message-status', (payload: { accountId: string; id: string; remoteJid?: string; participant?: string; status: MessageDeliveryStatus; timestamp?: number; error?: string }) => {
    if (!payload?.id || !payload?.status) return;
    const current = db.prepare(`SELECT status FROM message_log WHERE account_id=? AND id=?`).get(payload.accountId, payload.id) as { status?: string } | undefined;
    const currentRank = rank[current?.status ?? 'pending'] ?? 0;
    const nextRank = rank[payload.status] ?? 0;
    const isFailure = payload.status === 'failed';
    if (current && (isFailure || nextRank >= currentRank)) {
      db.prepare(`UPDATE message_log SET status=?, error=? WHERE account_id=? AND id=?`).run(payload.status, isFailure ? payload.error ?? 'WhatsApp rejeitou a mensagem' : null, payload.accountId, payload.id);
    }

    const recipient = db.prepare(`SELECT id,status,campaign_id FROM campaign_recipients WHERE message_id=? LIMIT 1`).get(payload.id) as { id?: number; status?: string; campaign_id?: string } | undefined;
    if (recipient?.id && (isFailure || nextRank >= (rank[recipient.status ?? 'pending'] ?? 0))) {
      const previousStatus = recipient.status ?? 'pending';
      db.prepare(`UPDATE campaign_recipients SET status=?, error=? WHERE id=?`).run(payload.status, isFailure ? payload.error ?? 'WhatsApp rejeitou a mensagem' : null, recipient.id);
      if (isFailure && recipient.campaign_id && previousStatus !== 'failed') {
        const wasCountedAsSent = ['sent', 'delivered', 'read', 'played'].includes(previousStatus);
        db.prepare(`
          UPDATE campaigns
          SET failed=failed+1,
              sent=CASE WHEN ?=1 THEN MAX(0,sent-1) ELSE sent END
          WHERE id=?
        `).run(wasCountedAsSent ? 1 : 0, recipient.campaign_id);
      }
    }

    if (!window.isDestroyed()) {
      window.webContents.send('messages:status', payload);
      if (recipient?.campaign_id) {
        const campaign = db.prepare(`SELECT * FROM campaigns WHERE id=? LIMIT 1`).get(recipient.campaign_id);
        if (campaign) window.webContents.send('campaigns:progress', campaign);
      }
    }
  });

  accounts.on('contact', payload => {
    if (!window.isDestroyed()) window.webContents.send('messages:contact', payload);
  });
}
