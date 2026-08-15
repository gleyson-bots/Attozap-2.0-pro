import { dialog, ipcMain } from 'electron';
import { extractPublicWebContacts } from './tools/public-web-extractor.js';
import { parseContactFile } from './tools/contact-file-import.js';

export function registerExtractorIpc() {
  ipcMain.handle('extractors:web-contacts', (_event, urls: string[]) => extractPublicWebContacts(Array.isArray(urls) ? urls : []));
  ipcMain.handle('importers:pick-contacts', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Lista de contatos', extensions: ['csv','txt','tsv'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return parseContactFile(result.filePaths[0]);
  });
}
