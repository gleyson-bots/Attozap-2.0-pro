import { dialog, ipcMain } from 'electron';
import type { AttozapDatabase } from './database.js';
import { extractPublicWebContacts } from './tools/public-web-extractor.js';
import { parseContactFile } from './tools/contact-file-import.js';
import { searchGooglePlaces, type GooglePlacesSearchInput } from './tools/google-places.js';

export function registerExtractorIpc(db: AttozapDatabase) {
  ipcMain.handle('extractors:web-contacts', (_event, urls: string[]) => extractPublicWebContacts(Array.isArray(urls) ? urls : []));
  ipcMain.handle('extractors:google-places', async (_event, input: GooglePlacesSearchInput) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key='google_places_api_key'`).get() as { value?: string } | undefined;
    return searchGooglePlaces(row?.value ?? '', input);
  });
  ipcMain.handle('importers:pick-contacts', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Planilhas e listas de contatos', extensions: ['xlsx', 'csv', 'txt', 'tsv'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return parseContactFile(result.filePaths[0]);
  });
}
