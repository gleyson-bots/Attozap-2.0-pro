import { BrowserWindow, dialog, ipcMain } from 'electron';
import QRCode from 'qrcode';
import type { AttozapDatabase } from './database.js';
import type { AccountManager } from './messaging/account-manager.js';
import type { CampaignEngine, CreateCampaignInput } from './campaigns/engine.js';
import type { AutoReplyEngine, AutoReplyRuleInput } from './automation/auto-reply.js';
import type { WaSenderTools, ImportedContact } from './tools/wasender-tools.js';
import type { LicenseService } from './license-service.js';

function send(window: BrowserWindow, channel: string, payload: unknown) {
  if (!window.isDestroyed()) window.webContents.send(channel, payload);
}

export function registerIpc(input: {
  window: BrowserWindow;
  db: AttozapDatabase;
  accounts: AccountManager;
  campaigns: CampaignEngine;
  autoReply: AutoReplyEngine;
  tools: WaSenderTools;
  license: LicenseService;
}) {
  const { window, db, accounts, campaigns, autoReply, tools, license } = input;

  ipcMain.handle('accounts:list', () => accounts.list());
  ipcMain.handle('accounts:create', (_event, name: string) => accounts.create(name));
  ipcMain.handle('accounts:rename', (_event, id: string, name: string) => accounts.rename(id, name));
  ipcMain.handle('accounts:set-proxy', (_event, id: string, proxy?: string) => accounts.setProxy(id, proxy));
  ipcMain.handle('accounts:connect', async (_event, id: string) => accounts.connect(id));
  ipcMain.handle('accounts:disconnect', async (_event, id: string, logout = false) => accounts.disconnect(id, logout));
  ipcMain.handle('accounts:remove', async (_event, id: string) => accounts.remove(id));

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
  accounts.on('message', payload => send(window, 'messages:incoming', payload));

  ipcMain.handle('campaigns:create', (_event, payload: CreateCampaignInput) => campaigns.create(payload));
  ipcMain.handle('campaigns:list', () => campaigns.list());
  ipcMain.handle('campaigns:get', (_event, id: string) => campaigns.get(id));
  ipcMain.handle('campaigns:recipients', (_event, id: string) => campaigns.recipients(id));
  ipcMain.handle('campaigns:start', (_event, id: string) => {
    void campaigns.start(id).catch(error => send(window, 'campaigns:error', { campaignId: id, message: error instanceof Error ? error.message : String(error) }));
    return { accepted: true };
  });
  ipcMain.handle('campaigns:pause', (_event, id: string) => campaigns.pause(id));
  ipcMain.handle('campaigns:resume', (_event, id: string) => campaigns.resume(id));
  ipcMain.handle('campaigns:stop', (_event, id: string) => campaigns.stop(id));
  ipcMain.handle('campaigns:schedule', (_event, id: string, runAt: string) => campaigns.schedule(id, runAt));
  ipcMain.handle('campaigns:schedules', () => campaigns.listSchedules());
  campaigns.on('progress', payload => send(window, 'campaigns:progress', payload));
  campaigns.on('error', payload => send(window, 'campaigns:error', payload));

  ipcMain.handle('contacts:list', (_event, search?: string) => tools.listContacts(search));
  ipcMain.handle('contacts:import', (_event, contacts: ImportedContact[]) => tools.importContacts(contacts));
  ipcMain.handle('contacts:block', (_event, phone: string, blocked: boolean) => tools.setBlocked(phone, blocked));
  ipcMain.handle('contacts:friendly', (_event, phone: string, friendly: boolean) => tools.setFriendly(phone, friendly));
  ipcMain.handle('contacts:blocked', () => tools.listBlocked());
  ipcMain.handle('contacts:friendly-list', () => tools.listFriendly());

  ipcMain.handle('tools:filter-numbers', (_event, accountId: string, numbers: string[]) => tools.filterNumbers(accountId, numbers));
  ipcMain.handle('tools:generate-numbers', (_event, payload) => tools.generateNumbers(payload));
  ipcMain.handle('groups:sync', (_event, accountId: string) => tools.syncGroups(accountId));
  ipcMain.handle('groups:list', (_event, accountId: string) => tools.listCachedGroups(accountId));
  ipcMain.handle('groups:members', (_event, accountId: string, groupJid: string) => tools.groupMembers(accountId, groupJid));
  ipcMain.handle('groups:active-members', (_event, accountId: string, groupJid: string, days?: number) => tools.activeGroupMembers(accountId, groupJid, days));
  ipcMain.handle('groups:create', (_event, accountId: string, subject: string, participants: string[]) => tools.groupCreate(accountId, subject, participants));
  ipcMain.handle('groups:add', (_event, accountId: string, groupJid: string, participants: string[]) => tools.groupAdd(accountId, groupJid, participants));
  ipcMain.handle('groups:join', (_event, accountId: string, invite: string) => tools.groupJoin(accountId, invite));
  ipcMain.handle('groups:verify', (_event, accountId: string, invite: string) => tools.groupVerify(accountId, invite));
  ipcMain.handle('groups:verify-many', (_event, accountId: string, invites: string[]) => tools.groupVerifyMany(accountId, invites));
  ipcMain.handle('groups:invite', (_event, accountId: string, groupJid: string) => tools.groupInvite(accountId, groupJid));

  ipcMain.handle('autoreply:list', (_event, accountId?: string) => autoReply.list(accountId));
  ipcMain.handle('autoreply:create', (_event, payload: AutoReplyRuleInput) => autoReply.create(payload));
  ipcMain.handle('autoreply:update', (_event, id: string, payload: Partial<AutoReplyRuleInput>) => autoReply.update(id, payload));
  ipcMain.handle('autoreply:remove', (_event, id: string) => autoReply.remove(id));

  ipcMain.handle('license:status', () => license.status());
  ipcMain.handle('license:activate', (_event, encoded: string) => license.activate(encoded));
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
