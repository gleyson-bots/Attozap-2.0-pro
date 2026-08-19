import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function registerDesktopIpc(window: BrowserWindow) {
  ipcMain.handle('files:save-text', async (_event, payload: {
    suggestedName: string;
    content: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => {
    if (!payload?.suggestedName || typeof payload.content !== 'string') {
      throw new Error('Arquivo inválido para salvar');
    }
    const result = await dialog.showSaveDialog(window, {
      title: 'Salvar arquivo',
      defaultPath: payload.suggestedName,
      filters: payload.filters,
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await writeFile(result.filePath, payload.content, 'utf8');
    return { saved: true, filePath: result.filePath };
  });

  ipcMain.handle('files:save-temp-binary', async (_event, payload: { base64: string; suggestedName?: string; maxBytes?: number }) => {
    const base64 = String(payload?.base64 ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('Conteúdo binário inválido');
    const maxBytes = Math.min(Math.max(Number(payload?.maxBytes ?? 15 * 1024 * 1024), 1), 25 * 1024 * 1024);
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > maxBytes) throw new Error(`Arquivo temporário excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MiB`);
    const rawName = String(payload?.suggestedName ?? 'audio.webm').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'audio.webm';
    const dir = join(app.getPath('temp'), 'attozap', 'outbound');
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${randomUUID()}-${rawName}`);
    await writeFile(filePath, bytes, { mode: 0o600 });
    return { filePath, size: bytes.length };
  });

  ipcMain.handle('clipboard:write-text', (_event, text: string) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });
}
