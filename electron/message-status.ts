import type { BrowserWindow } from 'electron';
import type { AttozapDatabase } from './database.js';
import type { AccountManager } from './messaging/account-manager.js';
import type { MessageDeliveryStatus } from './messaging/provider.js';
import { cacheMessageStatus, mergeDeliveryStatus } from './messaging/status.js';
import { applyCampaignDeliveryStatus } from './campaigns/delivery.js';

export function registerMessageStatusTracking(input: { window: BrowserWindow; db: AttozapDatabase; accounts: AccountManager }) {
  const { window, db, accounts } = input;

  accounts.on('message-status', (payload: { accountId: string; id: string; remoteJid?: string; participant?: string; status: MessageDeliveryStatus; timestamp?: number; error?: string }) => {
    if (!payload?.id || !payload?.status) return;

    // Persist the provider event first. sendMessage() and Baileys events can race;
    // this cache guarantees a status received before the local row is created is not lost.
    const cached = cacheMessageStatus(db, payload.accountId, payload.id, payload.status, payload.error);

    const current = db.prepare(`SELECT status FROM message_log WHERE account_id=? AND id=? LIMIT 1`).get(payload.accountId, payload.id) as { status?: string } | undefined;
    if (current) {
      const merged = mergeDeliveryStatus(current.status, cached.status);
      db.prepare(`UPDATE message_log SET status=?,error=? WHERE account_id=? AND id=?`).run(
        merged,
        merged === 'failed' ? (cached.error ?? payload.error ?? 'WhatsApp rejeitou a mensagem') : null,
        payload.accountId,
        payload.id,
      );
    }

    const campaignId = cached.status === 'pending'
      ? undefined
      : applyCampaignDeliveryStatus(db, payload.accountId, payload.id, cached.status, cached.error ?? payload.error);

    const outboundPayload = {
      ...payload,
      status: cached.status,
      error: cached.status === 'failed' ? (cached.error ?? payload.error) : undefined,
    };

    if (!window.isDestroyed()) {
      window.webContents.send('messages:status', outboundPayload);
      if (campaignId) {
        const campaign = db.prepare(`SELECT * FROM campaigns WHERE id=? LIMIT 1`).get(campaignId);
        if (campaign) window.webContents.send('campaigns:progress', campaign);
      }
    }
  });

  accounts.on('contact', payload => {
    if (!window.isDestroyed()) window.webContents.send('messages:contact', payload);
  });
}
