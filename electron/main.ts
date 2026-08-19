import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';
import { applyRc3Migrations } from './rc3-migrations.js';
import { applyDeliveryMigrations } from './delivery-migrations.js';
import { AccountManager } from './messaging/account-manager.js';
import { ChatService } from './messaging/chat-service.js';
import { CampaignEngine } from './campaigns/engine.js';
import { AutoReplyEngine } from './automation/auto-reply.js';
import { WarmupEngine } from './automation/warmup.js';
import { WaSenderTools } from './tools/wasender-tools.js';
import { LicenseService } from './license-service.js';
import { registerIpc } from './ipc.js';
import { registerExtractorIpc } from './extractor-ipc.js';
import { registerDesktopIpc } from './desktop-ipc.js';
import { registerChatIpc } from './chat-ipc.js';
import { registerWarmupIpc } from './warmup-ipc.js';
import { registerCampaignMonitorIpc } from './campaign-monitor-ipc.js';
import { registerBrowserHubIpc } from './browser-hub-ipc.js';
import { registerRecruitingIpc } from './recruiting-ipc.js';
import { applyPendingRestore, registerSystemIpc } from './system-ipc.js';
import { registerMessageStatusTracking } from './message-status.js';
import { registerRecoveryIpc } from './recovery-ipc.js';
import { registerAiIpc } from './ai-ipc.js';
import { DeliveryCenter } from './delivery-center.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let scheduler: NodeJS.Timeout | null = null;
let warmupEngine: WarmupEngine | null = null;

if (process.platform === 'win32') app.setAppUserModelId('com.gleysondevs.attozap.wasender');

function createWindow() {
  const window = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1080, minHeight: 720,
    backgroundColor: '#0b0d12', autoHideMenuBar: true, titleBarStyle: 'hiddenInset',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.webContents.on('did-fail-load', (_event, code, description, url) => console.error('[renderer:did-fail-load]', { code, description, url }));
  window.webContents.on('render-process-gone', (_event, details) => console.error('[renderer:gone]', details));
  window.webContents.on('preload-error', (_event, preloadPath, error) => console.error('[renderer:preload-error]', { preloadPath, error }));
  return window;
}

async function loadRenderer(window: BrowserWindow) {
  if (!app.isPackaged) await window.loadURL('http://localhost:5173');
  else await window.loadFile(join(__dirname, '../dist/index.html'));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, character => character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;');
}

async function showBootFailure(window: BrowserWindow, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const html = `<!doctype html><meta charset="utf-8"><title>ATTOZAP - Falha de inicialização</title><body style="margin:0;background:#0b0d12;color:#f5f7f6;font-family:Segoe UI,Arial,sans-serif;display:grid;place-items:center;min-height:100vh"><main style="max-width:720px;padding:32px;border:1px solid #29322e;border-radius:18px;background:#111612"><div style="color:#78d79b;font-size:12px;font-weight:700;letter-spacing:.14em">ATTOZAP RECOVERY</div><h1 style="font-size:25px;margin:12px 0">Não foi possível carregar a interface.</h1><p style="color:#aeb8b2;line-height:1.6">O processo principal continua ativo, mas o arquivo da interface falhou ao abrir.</p><pre style="white-space:pre-wrap;background:#0c100d;padding:14px;border-radius:10px;color:#ffadb4">${escapeHtml(message)}</pre><p style="color:#8c978f">Código: RENDERER_LOAD_FAILED</p></main></body>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
}

function safeRegister(name: string, action: () => void) {
  try { action(); return true; }
  catch (error) {
    console.error(`[startup:${name}]`, error);
    return false;
  }
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  const userData = app.getPath('userData');
  try { applyPendingRestore(userData); }
  catch (error) { console.error('[startup:pending-restore]', error); }

  const dbPath = join(userData, 'attozap.sqlite3');
  const db = openDatabase(dbPath);
  try {
    applyRc3Migrations(db);
    applyDeliveryMigrations(db);
  } catch (error) {
    console.error('[startup:migrations]', error);
    throw error;
  }

  const accounts = new AccountManager(db, join(userData, 'sessions'));
  const chat = new ChatService(db, accounts);
  const campaigns = new CampaignEngine(db, accounts, chat);
  const autoReply = new AutoReplyEngine(db, accounts);
  const tools = new WaSenderTools(db, accounts);
  warmupEngine = new WarmupEngine(db, chat);
  const licenseResources = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  const license = new LicenseService(db, licenseResources);
  const deliveryCenter = new DeliveryCenter(db);

  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);

  mainWindow = createWindow();

  safeRegister('recovery-ipc', () => registerRecoveryIpc(db, userData));
  safeRegister('core-ipc', () => registerIpc({ window: mainWindow!, db, accounts, campaigns, autoReply, tools, license, deliveryCenter }));
  safeRegister('extractor-ipc', () => registerExtractorIpc(db));
  safeRegister('desktop-ipc', () => registerDesktopIpc(mainWindow!));
  safeRegister('chat-ipc', () => registerChatIpc(chat, license));
  safeRegister('ai-ipc', () => registerAiIpc(db, license));
  safeRegister('warmup-ipc', () => registerWarmupIpc(warmupEngine!, license));
  safeRegister('campaign-monitor-ipc', () => registerCampaignMonitorIpc(mainWindow!, campaigns));
  safeRegister('browser-hub-ipc', () => registerBrowserHubIpc(mainWindow!));
  safeRegister('recruiting-ipc', () => registerRecruitingIpc(mainWindow!, db));
  safeRegister('system-ipc', () => registerSystemIpc({ window: mainWindow!, db, accounts, userData, dbPath }));
  safeRegister('message-status', () => registerMessageStatusTracking({ window: mainWindow!, db, accounts }));

  try { await loadRenderer(mainWindow); }
  catch (error) { console.error('[startup:renderer]', error); await showBootFailure(mainWindow, error); }

  const staleOnline = accounts.list().filter(account => ['connected', 'connecting', 'reconnecting', 'qr'].includes(account.status));
  const reconnectTasks = staleOnline.map(account => accounts.connect(account.id).catch(error => {
    console.error('[session:restore]', account.id, error);
    return accounts.disconnect(account.id, false).catch(() => undefined);
  }));
  void Promise.allSettled(reconnectTasks).then(() => warmupEngine?.resumePersisted());

  scheduler = setInterval(() => void campaigns.runDueSchedules().catch(error => console.error('[scheduler]', error)), 30_000);
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      try { await loadRenderer(mainWindow); }
      catch (error) { await showBootFailure(mainWindow, error); }
    }
  });
}).catch(error => console.error('[startup:fatal]', error));

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (scheduler) clearInterval(scheduler); warmupEngine?.shutdown(); });
