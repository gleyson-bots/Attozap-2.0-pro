import { ipcMain } from 'electron';
import type { WarmupEngine, WarmupProfileInput } from './automation/warmup.js';
import type { LicenseService } from './license-service.js';

export function registerWarmupIpc(warmup: WarmupEngine, license: LicenseService) {
  const requireLicense = () => {
    const status = license.status();
    if (!status.valid) throw new Error(`Licença necessária: ${status.reason ?? 'INVALID_LICENSE'}`);
  };

  ipcMain.handle('warmup:list', () => warmup.list());
  ipcMain.handle('warmup:create', (_event, payload: WarmupProfileInput) => { requireLicense(); return warmup.create(payload); });
  ipcMain.handle('warmup:update', (_event, id: string, payload: Partial<WarmupProfileInput>) => { requireLicense(); return warmup.update(id, payload); });
  ipcMain.handle('warmup:remove', (_event, id: string) => warmup.remove(id));
  ipcMain.handle('warmup:start', (_event, id: string) => { requireLicense(); return warmup.start(id); });
  ipcMain.handle('warmup:stop', (_event, id: string) => warmup.stop(id));
  ipcMain.handle('warmup:logs', (_event, id?: string, limit = 500) => warmup.logs(id, limit));
}
