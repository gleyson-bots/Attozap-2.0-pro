import { BrowserWindow, ipcMain, shell } from 'electron';

const portals: Record<string, { url: string; title: string; partition: string }> = {
  maps: { url: 'https://www.google.com/maps', title: 'Google Maps', partition: 'persist:attozap-maps' },
  linkedin: { url: 'https://www.linkedin.com/', title: 'LinkedIn', partition: 'persist:attozap-linkedin' },
  indeed: { url: 'https://br.indeed.com/', title: 'Indeed', partition: 'persist:attozap-indeed' },
  gupy: { url: 'https://www.gupy.io/', title: 'Gupy', partition: 'persist:attozap-gupy' },
  infojobs: { url: 'https://www.infojobs.com.br/', title: 'InfoJobs', partition: 'persist:attozap-infojobs' },
  catho: { url: 'https://www.catho.com.br/', title: 'Catho', partition: 'persist:attozap-catho' },
};

export function registerBrowserHubIpc(parent: BrowserWindow) {
  ipcMain.handle('browser:open-portal', async (_event, portalId: string) => {
    const portal = portals[portalId];
    if (!portal) throw new Error('Portal não permitido');

    const window = new BrowserWindow({
      parent,
      width: 1280,
      height: 840,
      minWidth: 900,
      minHeight: 620,
      title: `${portal.title} · ATTOZAP`,
      autoHideMenuBar: true,
      webPreferences: {
        partition: portal.partition,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return { action: 'deny' };
      } catch { return { action: 'deny' }; }
      void shell.openExternal(url);
      return { action: 'deny' };
    });

    await window.loadURL(portal.url);
    return { opened: true, portal: portalId };
  });

  ipcMain.handle('browser:portal-list', () => Object.entries(portals).map(([id, item]) => ({ id, title: item.title, url: item.url })));
}
