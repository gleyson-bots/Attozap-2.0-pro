import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { parseContactFile } from './tools/contact-file-import.js';

export function registerDesktopIpc(window: BrowserWindow) {
  ipcMain.handle('importers:pick-contacts', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Importar contatos',
      properties: ['openFile'],
      filters: [
        { name: 'Listas de contatos', extensions: ['csv', 'txt', 'tsv'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return parseContactFile(result.filePaths[0]);
  });

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

  ipcMain.handle('clipboard:write-text', (_event, text: string) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });
}
