import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from './database.js';
import type { AccountManager } from './messaging/account-manager.js';
import type { CampaignEngine, CreateCampaignInput } from './campaigns/engine.js';
import type { AutoReplyEngine, AutoReplyRuleInput } from './automation/auto-reply.js';
import type { WaSenderTools, ImportedContact } from './tools/wasender-tools.js';
import type { LicenseService } from './license-service.js';
import type { DeliveryCenter, DeliveryQuery } from './delivery-center.js';
import type { ChatService } from './messaging/chat-service.js';

function send(window: BrowserWindow, channel: string, payload: unknown) {
  if (!window.isDestroyed()) window.webContents.send(channel, payload);
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function registerIpc(input: {
  window: BrowserWindow;
  db: AttozapDatabase;
  accounts: AccountManager;
  chat: ChatService;
  campaigns: CampaignEngine;
  autoReply: AutoReplyEngine;
  tools: WaSenderTools;
  license: LicenseService;
  deliveryCenter: DeliveryCenter;
}) {
  const { window, db, accounts, chat, campaigns, autoReply, tools, license, deliveryCenter } = input;

  function requireLicense() {
    const status = license.status();
    if (!status.valid || !status.payload) {
      throw new Error(`Licença necessária: ${status.reason ?? 'INVALID_LICENSE'}. Abra a tela Licença, copie o fingerprint e ative uma licença válida.`);
    }
    return status.payload;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_message_templates_name ON message_templates(name, category);

    CREATE TABLE IF NOT EXISTS poll_reports (
      account_id TEXT NOT NULL,
      poll_id TEXT NOT NULL,
      remote_jid TEXT NOT NULL,
      question TEXT,
      result_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id, poll_id),
      FOREIGN KEY(account_id) REFERENCES instances(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_poll_reports_updated ON poll_reports(updated_at DESC);
  `);

  ipcMain.handle('delivery:query', (_event, query: DeliveryQuery = {}) => deliveryCenter.query(query));
  ipcMain.handle('app:open-external', async (_event, rawUrl: string) => {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!/^(https:\/\/wa\.me\/|mailto:)/i.test(url)) throw new Error('URL externa não permitida.');
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('accounts:list', () => accounts.list());
  ipcMain.handle('accounts:create', (_event, name: string) => {
    const payload = requireLicense();
    const limits = license.limitsFor(payload);
    if (limits.maxInstances != null && accounts.list().length >= limits.maxInstances) {
      throw new Error(`Esta licença permite no máximo ${limits.maxInstances} conta(s) WhatsApp.`);
    }
    return accounts.create(name);
  });
  ipcMain.handle('accounts:rename', (_event, id: string, name: string) => accounts.rename(id, name));
  ipcMain.handle('accounts:set-proxy', (_event, id: string, proxy?: string) => accounts.setProxy(id, proxy));
  ipcMain.handle('accounts:connect', async (_event, id: string) => {
    requireLicense();
    return accounts.connect(id);
  });
  ipcMain.handle('accounts:disconnect', async (_event, id: string, logout = false) => accounts.disconnect(id, logout));
  ipcMain.handle('accounts:remove', async (_event, id: string) => accounts.remove(id));
  ipcMain.handle('accounts:restriction', (_event, id: string) => accounts.restrictionDiagnostics(id));

  accounts.on('state', payload => send(window, 'accounts:state', payload));
  accounts.on('qr', async payload => {
    try {
      const dataUrl = await QRCode.toDataURL(payload.qr, { margin: 2, width: 320, errorCorrectionLevel: 'M' });
      send(window, 'accounts:qr', { accountId: payload.accountId, dataUrl });
    } catch (error) {
      send(window, 'accounts:error', { accountId: payload.accountId, message: error instanceof Error ? error.message : String(error) });
    }
  });
  accounts.on('error', payload => send(window, 'accounts:error', payload));
  accounts.on('restriction', payload => send(window, 'accounts:restriction', payload));
  accounts.on('contact', payload => send(window, 'messages:contact', payload));
  accounts.on('message', payload => {
    const persisted = payload?.message?.id ? chat.messageRow(payload.accountId, payload.message.id) : undefined;
    send(window, 'messages:incoming', { ...payload, persisted });
  });
  accounts.on('poll-update', payload => {
    db.prepare(`
      INSERT INTO poll_reports (account_id, poll_id, remote_jid, question, result_json, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(account_id,poll_id) DO UPDATE SET
        remote_jid=excluded.remote_jid,
        question=COALESCE(excluded.question, poll_reports.question),
        result_json=excluded.result_json,
        updated_at=CURRENT_TIMESTAMP
    `).run(payload.accountId, payload.pollId, payload.remoteJid, payload.question ?? null, JSON.stringify(payload.votes ?? []));
    send(window, 'polls:update', payload);
  });

  ipcMain.handle('campaigns:create', (_event, payload: CreateCampaignInput) => {
    requireLicense();
    return campaigns.create(payload);
  });
  ipcMain.handle('campaigns:list', () => campaigns.list());
  ipcMain.handle('campaigns:get', (_event, id: string) => campaigns.get(id));
  ipcMain.handle('campaigns:recipients', (_event, id: string) => campaigns.recipients(id));
  ipcMain.handle('campaigns:delete', (_event, id: string) => { requireLicense(); return campaigns.delete(id); });
  ipcMain.handle('campaigns:start', (_event, id: string) => {
    requireLicense();
    void campaigns.start(id).catch(error => send(window, 'campaigns:error', { campaignId: id, message: error instanceof Error ? error.message : String(error) }));
    return { accepted: true };
  });
  ipcMain.handle('campaigns:pause', (_event, id: string) => campaigns.pause(id));
  ipcMain.handle('campaigns:resume', (_event, id: string) => { requireLicense(); return campaigns.resume(id); });
  ipcMain.handle('campaigns:stop', (_event, id: string) => campaigns.stop(id));
  ipcMain.handle('campaigns:schedule', (_event, id: string, runAt: string) => { requireLicense(); return campaigns.schedule(id, runAt); });
  ipcMain.handle('campaigns:schedules', () => campaigns.listSchedules());
  campaigns.on('progress', payload => send(window, 'campaigns:progress', payload));
  campaigns.on('error', payload => send(window, 'campaigns:error', payload));

  ipcMain.handle('contacts:list', (_event, search?: string) => tools.listContacts(search));
  ipcMain.handle('contacts:import', (_event, contacts: ImportedContact[]) => tools.importContacts(contacts));
  ipcMain.handle('contacts:block', (_event, phone: string, blocked: boolean) => tools.setBlocked(phone, blocked));
  ipcMain.handle('contacts:friendly', (_event, phone: string, friendly: boolean) => tools.setFriendly(phone, friendly));
  ipcMain.handle('contacts:blocked', () => tools.listBlocked());
  ipcMain.handle('contacts:friendly-list', () => tools.listFriendly());
  ipcMain.handle('chats:list', (_event, accountId: string, includeGroups = false) => tools.listObservedChats(accountId, includeGroups));
  ipcMain.handle('chats:grab-contacts', (_event, accountId: string) => tools.grabContactsFromChats(accountId));

  ipcMain.handle('tools:filter-numbers', (_event, accountId: string, numbers: string[]) => { requireLicense(); return tools.filterNumbers(accountId, numbers); });
  ipcMain.handle('tools:generate-numbers', (_event, payload) => tools.generateNumbers(payload));
  ipcMain.handle('groups:sync', (_event, accountId: string) => { requireLicense(); return tools.syncGroups(accountId); });
  ipcMain.handle('groups:list', (_event, accountId: string) => tools.listCachedGroups(accountId));
  ipcMain.handle('groups:members', (_event, accountId: string, groupJid: string) => { requireLicense(); return tools.groupMembers(accountId, groupJid); });
  ipcMain.handle('groups:active-members', (_event, accountId: string, groupJid: string, days?: number) => tools.activeGroupMembers(accountId, groupJid, days));
  ipcMain.handle('groups:create', (_event, accountId: string, subject: string, participants: string[]) => { requireLicense(); return tools.groupCreate(accountId, subject, participants); });
  ipcMain.handle('groups:add', (_event, accountId: string, groupJid: string, participants: string[]) => { requireLicense(); return tools.groupAdd(accountId, groupJid, participants); });
  ipcMain.handle('groups:join', (_event, accountId: string, invite: string) => { requireLicense(); return tools.groupJoin(accountId, invite); });
  ipcMain.handle('groups:verify', (_event, accountId: string, invite: string) => { requireLicense(); return tools.groupVerify(accountId, invite); });
  ipcMain.handle('groups:verify-many', (_event, accountId: string, invites: string[]) => { requireLicense(); return tools.groupVerifyMany(accountId, invites); });
  ipcMain.handle('groups:invite', (_event, accountId: string, groupJid: string) => { requireLicense(); return tools.groupInvite(accountId, groupJid); });

  ipcMain.handle('groups:create-many', async (_event, accountId: string, jobs: Array<{ subject: string; participants: string[] }>, delayMs = 1000) => {
    requireLicense();
    const safeJobs = jobs.slice(0, 25).map(job => ({ subject: job.subject.trim(), participants: [...new Set(job.participants.map(value => value.trim()).filter(Boolean))].slice(0, 500) })).filter(job => job.subject);
    const results: Array<{ subject: string; ok: boolean; group?: unknown; error?: string }> = [];
    for (const job of safeJobs) {
      try { results.push({ subject: job.subject, ok: true, group: await tools.groupCreate(accountId, job.subject, job.participants) }); }
      catch (error) { results.push({ subject: job.subject, ok: false, error: error instanceof Error ? error.message : String(error) }); }
      if (delayMs > 0) await sleep(Math.max(250, Math.min(30_000, delayMs)));
    }
    return results;
  });

  ipcMain.handle('groups:add-many', async (_event, accountId: string, jobs: Array<{ groupJid: string; participants: string[] }>, delayMs = 1000) => {
    requireLicense();
    const safeJobs = jobs.slice(0, 50).map(job => ({ groupJid: job.groupJid.trim(), participants: [...new Set(job.participants.map(value => value.trim()).filter(Boolean))].slice(0, 500) })).filter(job => job.groupJid && job.participants.length);
    const results: Array<{ groupJid: string; ok: boolean; result?: unknown; error?: string }> = [];
    for (const job of safeJobs) {
      try { results.push({ groupJid: job.groupJid, ok: true, result: await tools.groupAdd(accountId, job.groupJid, job.participants) }); }
      catch (error) { results.push({ groupJid: job.groupJid, ok: false, error: error instanceof Error ? error.message : String(error) }); }
      if (delayMs > 0) await sleep(Math.max(250, Math.min(30_000, delayMs)));
    }
    return results;
  });

  ipcMain.handle('templates:list', () => db.prepare(`SELECT * FROM message_templates ORDER BY category, name`).all());
  ipcMain.handle('templates:create', (_event, payload: { name: string; category?: string; body: string }) => {
    const name = payload.name.trim();
    const body = payload.body.trim();
    if (!name || !body) throw new Error('Nome e conteúdo são obrigatórios');
    const id = randomUUID();
    db.prepare(`INSERT INTO message_templates (id, name, category, body) VALUES (?, ?, ?, ?)`).run(id, name, payload.category?.trim() || null, body);
    return db.prepare(`SELECT * FROM message_templates WHERE id=?`).get(id);
  });
  ipcMain.handle('templates:update', (_event, id: string, payload: { name: string; category?: string; body: string }) => {
    const name = payload.name.trim();
    const body = payload.body.trim();
    if (!name || !body) throw new Error('Nome e conteúdo são obrigatórios');
    db.prepare(`UPDATE message_templates SET name=?, category=?, body=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name, payload.category?.trim() || null, body, id);
    return db.prepare(`SELECT * FROM message_templates WHERE id=?`).get(id);
  });
  ipcMain.handle('templates:remove', (_event, id: string) => { db.prepare(`DELETE FROM message_templates WHERE id=?`).run(id); return true; });

  ipcMain.handle('polls:list', (_event, accountId?: string) => {
    const rows = (accountId
      ? db.prepare(`SELECT * FROM poll_reports WHERE account_id=? ORDER BY updated_at DESC`).all(accountId)
      : db.prepare(`SELECT * FROM poll_reports ORDER BY updated_at DESC`).all()) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      ...row,
      votes: JSON.parse(String(row.result_json ?? '[]')),
    }));
  });

  ipcMain.handle('autoreply:list', (_event, accountId?: string) => autoReply.list(accountId));
  ipcMain.handle('autoreply:create', (_event, payload: AutoReplyRuleInput) => { requireLicense(); return autoReply.create(payload); });
  ipcMain.handle('autoreply:update', (_event, id: string, payload: Partial<AutoReplyRuleInput>) => { requireLicense(); return autoReply.update(id, payload); });
  ipcMain.handle('autoreply:remove', (_event, id: string) => autoReply.remove(id));

  ipcMain.handle('license:status', () => license.status());
  ipcMain.handle('license:activate', (_event, encoded: string) => license.activate(encoded));
  ipcMain.handle('license:renew', (_event, encoded: string) => license.renew(encoded));
  ipcMain.handle('license:deactivate', () => license.deactivate());

  ipcMain.handle('files:pick', async (_event, options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const result = await dialog.showOpenDialog(window, {
      properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options?.filters,
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('settings:get', (_event, key: string) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value?: string } | undefined;
    return row?.value;
  });
  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    db.prepare(`
      INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
    `).run(key, value);
    return true;
  });
  ipcMain.handle('audit:list', () => db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500`).all());
}
