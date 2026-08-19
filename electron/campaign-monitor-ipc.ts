import { BrowserWindow, ipcMain } from 'electron';
import type { CampaignEngine } from './campaigns/engine.js';

export function registerCampaignMonitorIpc(window: BrowserWindow, campaigns: CampaignEngine) {
  ipcMain.handle('campaigns:runtime', (_event, id?: string) => campaigns.runtimeState(id));
  ipcMain.handle('campaigns:force-next', (_event, id: string) => campaigns.forceNext(id));

  const sendRuntime = (payload: unknown) => {
    if (!window.isDestroyed()) window.webContents.send('campaigns:runtime-update', payload);
  };
  campaigns.on('runtime', sendRuntime);
  window.once('closed', () => campaigns.off('runtime', sendRuntime));
}