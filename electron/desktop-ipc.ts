import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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

  ipcMain.handle('files:read-preview', async (_event, filePath: string) => {
    const requested = String(filePath ?? '').trim();
    if (!requested || requested.length > 4096) throw new Error('Caminho de mídia inválido');
    const fileName = requested.split(/[\\\\/]/).pop() || 'arquivo';
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
    const mimeByExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', opus: 'audio/ogg', pdf: 'application/pdf' };
    const mimeType = mimeByExtension[extension || ''] || 'application/octet-stream';
    const info = await stat(requested);
    const maxBytes = 25 * 1024 * 1024;
    if (!info.isFile() || info.size <= 0 || info.size > maxBytes) throw new Error('A mídia deve ser um arquivo válido de até 25 MiB.');
    const bytes = await readFile(requested);
    const kind = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'document';
    return { filePath: requested, fileName, mimeType, kind, size: bytes.length, dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` };
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
