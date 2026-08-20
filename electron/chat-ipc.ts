import { ipcMain } from 'electron';
import type { ChatService } from './messaging/chat-service.js';
import type { LicenseService } from './license-service.js';

export function registerChatIpc(chat: ChatService, license: LicenseService) {
  const requireLicense = () => {
    const status = license.status();
    if (!status.valid) throw new Error(`Licença necessária: ${status.reason ?? 'INVALID_LICENSE'}`);
  };

  ipcMain.handle('webchat:list', (_event, accountId: string, search = '') => chat.listChats(accountId, search));
  ipcMain.handle('webchat:messages', (_event, accountId: string, remoteJid: string, limit = 250) => chat.listMessages(accountId, remoteJid, limit));
  ipcMain.handle('webchat:refresh-profile', (_event, accountId: string, remoteJid: string) => chat.refreshProfile(accountId, remoteJid));
  ipcMain.handle('webchat:sync-contact', (_event, accountId: string, remoteJid: string, localName?: string) => chat.syncContact(accountId, remoteJid, localName));
  ipcMain.handle('webchat:message-status', (_event, accountId: string, messageId: string) => chat.messageStatus(accountId, messageId));
  const requireWebChat = () => {
    requireLicense();
    license.assertFeature('webchat');
  };
  ipcMain.handle('webchat:resolve', (_event, accountId: string, target: string) => { requireWebChat(); return chat.resolveTarget(accountId, target); });
  ipcMain.handle('webchat:send-text', (_event, accountId: string, target: string, text: string) => { requireWebChat(); return chat.sendText(accountId, target, text); });
  ipcMain.handle('webchat:send-media', (_event, accountId: string, target: string, type: 'image'|'video'|'document'|'audio'|'sticker', input: any) => {
    requireWebChat();
    return chat.sendMedia(accountId, target, type, input);
  });
  ipcMain.handle('webchat:send-poll', (_event, accountId: string, target: string, input: { name: string; values: string[]; selectableCount?: number }) => {
    requireWebChat();
    return chat.sendPoll(accountId, target, input);
  });
  ipcMain.handle('webchat:send-location', (_event, accountId: string, target: string, input: { latitude: number; longitude: number; name?: string; address?: string }) => {
    requireWebChat();
    return chat.sendContent(accountId, target, { type: 'location', input });
  });
  ipcMain.handle('webchat:send-contact', (_event, accountId: string, target: string, input: { displayName: string; phone: string; organization?: string }) => {
    requireWebChat();
    return chat.sendContent(accountId, target, { type: 'contact', input });
  });
}
