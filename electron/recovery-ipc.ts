import { ipcMain } from 'electron';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AttozapDatabase } from './database.js';

function clean(value: unknown, max = 12_000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

export function registerRecoveryIpc(db: AttozapDatabase, userData: string) {
  const logDir = join(userData, 'logs');
  const logPath = join(logDir, 'renderer-errors.log');

  ipcMain.handle('diagnostics:renderer-error', async (_event, payload: any) => {
    try {
      await mkdir(logDir, { recursive: true });
      const entry = {
        at: new Date().toISOString(),
        kind: clean(payload?.kind, 120),
        message: clean(payload?.message, 4000),
        stack: clean(payload?.stack, 12_000),
        componentStack: clean(payload?.componentStack, 12_000),
        href: clean(payload?.href, 1000),
      };
      await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
      return { saved: true, logPath };
    } catch {
      return { saved: false, logPath };
    }
  });

  ipcMain.handle('diagnostics:reset-ui', () => {
    db.prepare(`DELETE FROM settings WHERE key LIKE 'ui_%'`).run();
    db.prepare(`INSERT INTO audit_log(actor,action,entity_type,metadata_json) VALUES ('local-user','diagnostics.reset-ui','system',?)`).run(JSON.stringify({ at: new Date().toISOString() }));
    return true;
  });

  ipcMain.handle('diagnostics:log-path', () => logPath);
}
