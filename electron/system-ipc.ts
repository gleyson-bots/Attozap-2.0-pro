import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, statfsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AttozapDatabase } from './database.js';
import type { AccountManager } from './messaging/account-manager.js';
import { getSecureSetting, migratePlainSecret, secureStorageAvailable, setSecureSetting } from './secure-settings.js';

const PENDING_DIR = 'pending-restore';
const DB_NAME = 'attozap.sqlite3';

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
}

function sqliteFileLooksValid(path: string) {
  try { return readFileSync(path).subarray(0, 16).toString('utf8') === 'SQLite format 3\u0000'; }
  catch { return false; }
}

export function applyPendingRestore(userData: string) {
  const pending = join(userData, PENDING_DIR);
  const stagedDb = join(pending, DB_NAME);
  if (!existsSync(stagedDb)) return false;
  if (!sqliteFileLooksValid(stagedDb)) {
    rmSync(pending, { recursive: true, force: true });
    return false;
  }
  const dbPath = join(userData, DB_NAME);
  mkdirSync(userData, { recursive: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  copyFileSync(stagedDb, dbPath);
  const stagedSessions = join(pending, 'sessions');
  if (existsSync(stagedSessions)) {
    const sessions = join(userData, 'sessions');
    rmSync(sessions, { recursive: true, force: true });
    cpSync(stagedSessions, sessions, { recursive: true, force: true });
  }
  rmSync(pending, { recursive: true, force: true });
  return true;
}

function bytes(value: number) { return Math.max(0, Math.round(value)); }
function count(db: AttozapDatabase, sql: string, ...args: unknown[]) {
  const row = db.prepare(sql).get(...args) as { total?: number } | undefined;
  return Number(row?.total ?? 0);
}

export function registerSystemIpc(input: {
  window: BrowserWindow;
  db: AttozapDatabase;
  accounts: AccountManager;
  userData: string;
  dbPath: string;
}) {
  const { window, db, accounts, userData, dbPath } = input;

  async function health() {
    let quickCheck = 'unknown';
    try { quickCheck = String(db.pragma('quick_check', { simple: true }) ?? 'unknown'); } catch { quickCheck = 'error'; }
    let diskFree = 0;
    let diskTotal = 0;
    try {
      const fs = statfsSync(userData);
      diskFree = bytes(Number(fs.bavail) * Number(fs.bsize));
      diskTotal = bytes(Number(fs.blocks) * Number(fs.bsize));
    } catch {}
    const accountRows = accounts.list().map(account => {
      let runtimeConnected = false;
      try { runtimeConnected = accounts.provider(account.id).isConnected(); } catch {}
      return { ...account, runtimeConnected, staleConnected: account.status === 'connected' && !runtimeConnected };
    });
    const failed24h = count(db, `SELECT COUNT(*) total FROM message_log WHERE status='failed' AND created_at >= datetime('now','-1 day')`);
    const issues: Array<{ level: 'warning'|'critical'; code: string; message: string }> = [];
    if (quickCheck !== 'ok') issues.push({ level: 'critical', code: 'DATABASE_INTEGRITY', message: `SQLite quick_check retornou: ${quickCheck}` });
    for (const account of accountRows.filter(row => row.staleConnected)) issues.push({ level: 'critical', code: 'STALE_SESSION', message: `${account.name}: banco indica conectado, mas não existe socket ativo.` });
    if (diskFree && diskFree < 100 * 1024 * 1024) issues.push({ level: 'critical', code: 'LOW_DISK', message: 'Menos de 100 MB livres no disco.' });
    else if (diskFree && diskFree < 500 * 1024 * 1024) issues.push({ level: 'warning', code: 'LOW_DISK', message: 'Menos de 500 MB livres no disco.' });
    if (failed24h >= 10) issues.push({ level: 'warning', code: 'MESSAGE_FAILURES', message: `${failed24h} falhas de mensagem registradas nas últimas 24 horas.` });
    const overall = issues.some(issue => issue.level === 'critical') ? 'critical' : issues.length ? 'warning' : 'healthy';
    const lastMessage = db.prepare(`SELECT created_at,status FROM message_log ORDER BY created_at DESC LIMIT 1`).get() as { created_at?: string; status?: string } | undefined;
    return {
      overall,
      generatedAt: new Date().toISOString(),
      database: { quickCheck, journalMode: String(db.pragma('journal_mode', { simple: true }) ?? ''), sizeBytes: existsSync(dbPath) ? statSync(dbPath).size : 0 },
      disk: { freeBytes: diskFree, totalBytes: diskTotal },
      process: { memoryBytes: process.memoryUsage().rss, platform: process.platform, arch: process.arch, node: process.versions.node, electron: process.versions.electron },
      accounts: accountRows,
      counts: {
        messages: count(db, `SELECT COUNT(*) total FROM message_log`), failed24h,
        contacts: count(db, `SELECT COUNT(*) total FROM contacts`), identities: count(db, `SELECT COUNT(*) total FROM wa_identities`),
        groups: count(db, `SELECT COUNT(*) total FROM group_cache`), campaigns: count(db, `SELECT COUNT(*) total FROM campaigns`),
        warmups: count(db, `SELECT COUNT(*) total FROM warmup_profiles`),
      },
      lastMessage,
      issues,
      secureStorage: secureStorageAvailable(),
    };
  }

  ipcMain.handle('system:health', () => health());
  ipcMain.handle('system:optimize', () => {
    db.pragma('optimize');
    db.pragma('wal_checkpoint(PASSIVE)');
    db.prepare(`INSERT INTO audit_log(actor,action,entity_type,metadata_json) VALUES ('local-user','system.optimize','system',?)`).run(JSON.stringify({ at: new Date().toISOString() }));
    return true;
  });

  ipcMain.handle('system:backup', async (_event, includeSessions = true) => {
    const choice = await dialog.showOpenDialog(window, { title: 'Escolha onde salvar o backup do ATTOZAP', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return { saved: false };
    const folder = join(choice.filePaths[0], `ATTOZAP-Backup-${stamp()}`);
    await mkdir(folder, { recursive: true });
    await db.backup(join(folder, DB_NAME));
    if (includeSessions && existsSync(join(userData, 'sessions'))) await cp(join(userData, 'sessions'), join(folder, 'sessions'), { recursive: true, force: true });
    const manifest = {
      format: 'attozap-local-backup', version: 1, appVersion: app.getVersion(), createdAt: new Date().toISOString(),
      includesSessions: Boolean(includeSessions), warning: includeSessions ? 'Contém credenciais locais de sessão do WhatsApp. Armazene em local privado.' : undefined,
    };
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    db.prepare(`INSERT INTO audit_log(actor,action,entity_type,metadata_json) VALUES ('local-user','system.backup','system',?)`).run(JSON.stringify({ includeSessions: Boolean(includeSessions), folder: basename(folder) }));
    return { saved: true, folder, includeSessions: Boolean(includeSessions) };
  });

  ipcMain.handle('system:restore', async () => {
    const choice = await dialog.showOpenDialog(window, { title: 'Selecione a pasta de backup do ATTOZAP', properties: ['openDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return { restored: false };
    const source = choice.filePaths[0];
    const sourceDb = join(source, DB_NAME);
    if (!existsSync(sourceDb) || !sqliteFileLooksValid(sourceDb)) throw new Error('A pasta escolhida não contém um backup ATTOZAP válido.');
    const pending = join(userData, PENDING_DIR);
    await rm(pending, { recursive: true, force: true });
    await mkdir(pending, { recursive: true });
    await cp(sourceDb, join(pending, DB_NAME));
    const sourceSessions = join(source, 'sessions');
    if (existsSync(sourceSessions)) await cp(sourceSessions, join(pending, 'sessions'), { recursive: true, force: true });
    await writeFile(join(pending, 'restore.json'), JSON.stringify({ source: basename(source), stagedAt: new Date().toISOString(), hasSessions: existsSync(sourceSessions) }, null, 2));
    setTimeout(() => { app.relaunch(); app.exit(0); }, 400);
    return { restored: true, restarting: true, hasSessions: existsSync(sourceSessions) };
  });

  ipcMain.handle('system:diagnostics', async () => {
    const summary = await health();
    const audit = db.prepare(`SELECT action,entity_type,entity_id,created_at FROM audit_log ORDER BY created_at DESC LIMIT 100`).all();
    return { app: { version: app.getVersion(), platform: process.platform, arch: process.arch }, health: summary, recentAudit: audit };
  });

  ipcMain.handle('identities:list', (_event, accountId?: string, search = '') => {
    const clean = search.trim();
    const term = `%${clean}%`;
    return db.prepare(`
      SELECT i.account_id,a.name account_name,i.canonical_jid,i.lid,i.pn_jid,i.phone,i.push_name,i.source,i.first_seen_at,i.last_seen_at
      FROM wa_identities i JOIN instances a ON a.id=i.account_id
      WHERE (? IS NULL OR i.account_id=?) AND (?='' OR i.canonical_jid LIKE ? OR COALESCE(i.lid,'') LIKE ? OR COALESCE(i.pn_jid,'') LIKE ? OR COALESCE(i.phone,'') LIKE ? OR COALESCE(i.push_name,'') LIKE ?)
      ORDER BY i.last_seen_at DESC LIMIT 2000
    `).all(accountId || null, accountId || null, clean, term, term, term, term, term);
  });

  ipcMain.handle('identities:stats', () => db.prepare(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN lid IS NOT NULL THEN 1 ELSE 0 END) with_lid,
      SUM(CASE WHEN pn_jid IS NOT NULL THEN 1 ELSE 0 END) with_pn,
      SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) with_phone,
      SUM(CASE WHEN push_name IS NOT NULL THEN 1 ELSE 0 END) with_pushname
    FROM wa_identities
  `).get());

  migratePlainSecret(db, 'ai_xai_key');
  migratePlainSecret(db, 'ai_poolside_key');
  ipcMain.handle('secure:available', () => secureStorageAvailable());
  ipcMain.handle('secure:get', (_event, key: string) => getSecureSetting(db, String(key)) ?? '');
  ipcMain.handle('secure:set', (_event, key: string, value: string) => setSecureSetting(db, String(key), String(value ?? '')));
}
