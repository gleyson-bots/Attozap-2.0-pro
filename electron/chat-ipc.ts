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
  ipcMain.handle('webchat:resolve', (_event, accountId: string, target: string) => { requireLicense(); return chat.resolveTarget(accountId, target); });
  ipcMain.handle('webchat:send-text', (_event, accountId: string, target: string, text: string) => { requireLicense(); return chat.sendText(accountId, target, text); });
  ipcMain.handle('webchat:send-media', (_event, accountId: string, target: string, type: 'image'|'video'|'document'|'audio'|'sticker', input: any) => {
    requireLicense();
    return chat.sendMedia(accountId, target, type, input);
  });
}
