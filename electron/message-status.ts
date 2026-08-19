import type { BrowserWindow } from 'electron';
import type { AttozapDatabase } from './database.js';
import type { AccountManager } from './messaging/account-manager.js';
import type { MessageDeliveryStatus } from './messaging/provider.js';
import { cacheMessageStatus, mergeDeliveryStatus } from './messaging/status.js';
import { applyCampaignDeliveryStatus } from './campaigns/delivery.js';

function uniqueValues(values: Array<unknown>) {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))];
}

function findMessageByTransportAlias(db: AttozapDatabase, accountId: string, payload: { remoteJid?: string; participant?: string; timestamp?: number }) {
  const initialAliases = uniqueValues([payload.remoteJid, payload.participant]);
  if (!initialAliases.length) return undefined;

  const placeholders = initialAliases.map(() => '?').join(',');
  const identityRows = db.prepare(`
    SELECT canonical_jid, lid, pn_jid FROM wa_identities
    WHERE account_id=? AND (
      canonical_jid IN (${placeholders}) OR
      lid IN (${placeholders}) OR
      pn_jid IN (${placeholders})
    )
  `).all(accountId, ...initialAliases, ...initialAliases, ...initialAliases) as Array<{ canonical_jid?: string; lid?: string; pn_jid?: string }>;
  const aliases = uniqueValues([
    ...initialAliases,
    ...identityRows.flatMap(row => [row.canonical_jid, row.lid, row.pn_jid]),
  ]);
  const aliasPlaceholders = aliases.map(() => '?').join(',');
  const eventTime = Number(payload.timestamp);
  const notBefore = Number.isFinite(eventTime) && eventTime > 0
    ? new Date(eventTime - 15 * 60 * 1000).toISOString()
    : new Date(Date.now() - 15 * 60 * 1000).toISOString();

  return db.prepare(`
    SELECT id,status FROM message_log
    WHERE account_id=? AND direction='out' AND status='pending'
      AND remote_jid IN (${aliasPlaceholders}) AND created_at>=?
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get(accountId, ...aliases, notBefore) as { id?: string; status?: string } | undefined;
}

export function registerMessageStatusTracking(input: { window: BrowserWindow; db: AttozapDatabase; accounts: AccountManager }) {
  const { window, db, accounts } = input;

  accounts.on('message-status', (payload: { accountId: string; id: string; remoteJid?: string; participant?: string; status: MessageDeliveryStatus; rawStatus?: number; failureCode?: string; failureClass?: 'account_restriction' | 'remote_rejection'; timestamp?: number; error?: string }) => {
    if (!payload?.id || !payload?.status) return;

    // Persist the provider event first. sendMessage() and Baileys events can race;
    // this cache guarantees a status received before the local row is created is not lost.
    const directCached = cacheMessageStatus(db, payload.accountId, payload.id, payload.status, payload.error);
    let effectiveId = payload.id;
    let cached = directCached;
    let current = db.prepare(`SELECT status FROM message_log WHERE account_id=? AND id=? LIMIT 1`).get(payload.accountId, effectiveId) as { status?: string } | undefined;

    // PN/LID conversion can make Baileys report the transport JID while the local
    // log contains its canonical alias. Upgrade the newest pending row for that
    // conversation instead of leaving the optimistic bubble in "enviando".
    if (!current) {
      const aliasMatch = findMessageByTransportAlias(db, payload.accountId, payload);
      if (aliasMatch?.id) {
        effectiveId = aliasMatch.id;
        cached = cacheMessageStatus(db, payload.accountId, effectiveId, payload.status, payload.error);
        current = db.prepare(`SELECT status FROM message_log WHERE account_id=? AND id=? LIMIT 1`).get(payload.accountId, effectiveId) as { status?: string } | undefined;
      }
    }

    if (current) {
      const merged = mergeDeliveryStatus(current.status, cached.status);
      db.prepare(`UPDATE message_log SET status=?,error=? WHERE account_id=? AND id=?`).run(
        merged,
        merged === 'failed' ? (cached.error ?? payload.error ?? 'WhatsApp rejeitou a mensagem') : null,
        payload.accountId,
        effectiveId,
      );
      cached = { ...cached, status: merged };
    }

    const campaignId = cached.status === 'pending'
      ? undefined
      : applyCampaignDeliveryStatus(db, payload.accountId, effectiveId, cached.status, cached.error ?? payload.error);

    const outboundPayload = {
      ...payload,
      id: effectiveId,
      status: cached.status,
      error: cached.status === 'failed' ? (cached.error ?? payload.error) : undefined,
      failureCode: payload.failureCode,
      failureClass: payload.failureClass,
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
