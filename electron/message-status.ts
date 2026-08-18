import type { BrowserWindow } from 'electron';
import type { AttozapDatabase } from './database.js';
import type { AccountManager } from './messaging/account-manager.js';
import type { MessageDeliveryStatus } from './messaging/provider.js';

const rank: Record<string, number> = { pending: 0, failed: 0, sent: 1, delivered: 2, read: 3, played: 4 };

export function registerMessageStatusTracking(input: { window: BrowserWindow; db: AttozapDatabase; accounts: AccountManager }) {
  const { window, db, accounts } = input;
  accounts.on('message-status', (payload: { accountId: string; id: string; remoteJid?: string; participant?: string; status: MessageDeliveryStatus; timestamp?: number }) => {
    if (!payload?.id || !payload?.status) return;
    const current = db.prepare(`SELECT status FROM message_log WHERE account_id=? AND id=?`).get(payload.accountId, payload.id) as { status?: string } | undefined;
    const currentRank = rank[current?.status ?? 'pending'] ?? 0;
    const nextRank = rank[payload.status] ?? 0;
    if (current && nextRank >= currentRank) db.prepare(`UPDATE message_log SET status=? WHERE account_id=? AND id=?`).run(payload.status, payload.accountId, payload.id);

    const recipient = db.prepare(`SELECT id,status FROM campaign_recipients WHERE message_id=? LIMIT 1`).get(payload.id) as { id?: number; status?: string } | undefined;
    if (recipient?.id && nextRank >= (rank[recipient.status ?? 'pending'] ?? 0)) db.prepare(`UPDATE campaign_recipients SET status=? WHERE id=?`).run(payload.status, recipient.id);

    if (!window.isDestroyed()) window.webContents.send('messages:status', payload);
  });

  accounts.on('contact', payload => {
    if (!window.isDestroyed()) window.webContents.send('messages:contact', payload);
  });
}
