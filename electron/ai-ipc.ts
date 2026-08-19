import { ipcMain } from 'electron';
import type { AttozapDatabase } from './database.js';
import type { LicenseService } from './license-service.js';
import { chatWithAi, listAiProviders, type AiChatInput } from './ai-service.js';

export function registerAiIpc(db: AttozapDatabase, license: LicenseService) {
  const requireLicense = () => {
    const status = license.status();
    if (!status.valid) throw new Error(`Licença necessária: ${status.reason ?? 'INVALID_LICENSE'}`);
  };
  ipcMain.handle('ai:providers', () => { requireLicense(); return listAiProviders(db); });
  ipcMain.handle('ai:chat', (_event, input: AiChatInput) => {
    requireLicense();
    if (!input || typeof input !== 'object') throw new Error('Pedido IA inválido');
    return chatWithAi(db, input);
  });
}
