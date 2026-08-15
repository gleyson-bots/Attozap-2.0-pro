import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';
import { AccountManager } from './messaging/account-manager.js';
import { CampaignEngine } from './campaigns/engine.js';
import { AutoReplyEngine } from './automation/auto-reply.js';
import { WaSenderTools } from './tools/wasender-tools.js';
import { LicenseService } from './license-service.js';
import { registerIpc } from './ipc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let scheduler: NodeJS.Timeout | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) await mainWindow.loadURL('http://localhost:5173');
  else await mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  return mainWindow;
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  const userData = app.getPath('userData');
  const db = openDatabase(join(userData, 'attozap.sqlite3'));
  const accounts = new AccountManager(db, join(userData, 'sessions'));
  const campaigns = new CampaignEngine(db, accounts);
  const autoReply = new AutoReplyEngine(db, accounts);
  const tools = new WaSenderTools(db, accounts);
  const licenseResources = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  const license = new LicenseService(db, licenseResources);

  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);

  const window = await createWindow();
  registerIpc({ window, db, accounts, campaigns, autoReply, tools, license });

  scheduler = setInterval(() => {
    void campaigns.runDueSchedules().catch(error => console.error('[scheduler]', error));
  }, 30_000);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (scheduler) clearInterval(scheduler);
});
