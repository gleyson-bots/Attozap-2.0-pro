import { ipcMain } from 'electron';
import { extractPublicWebContacts } from './tools/public-web-extractor.js';

export function registerExtractorIpc() {
  ipcMain.handle('extractors:web-contacts', (_event, urls: string[]) => extractPublicWebContacts(Array.isArray(urls) ? urls : []));
}
