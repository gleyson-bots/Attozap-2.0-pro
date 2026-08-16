import { readFile } from 'node:fs/promises';

const preloadPath = 'electron/preload.cts';
const handlerFiles = [
  'electron/main.ts',
  'electron/ipc.ts',
  'electron/extractor-ipc.ts',
  'electron/desktop-ipc.ts',
];

const preload = await readFile(preloadPath, 'utf8');
const handlerSources = await Promise.all(handlerFiles.map(path => readFile(path, 'utf8')));

const invokes = new Set([...preload.matchAll(/invoke(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]));
const handlers = new Set(handlerSources.flatMap(source => [...source.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)].map(match => match[1])));
const missing = [...invokes].filter(channel => !handlers.has(channel)).sort();

if (missing.length) {
  console.error('IPC contract mismatch. Preload invokes channels without ipcMain.handle:');
  for (const channel of missing) console.error(`  - ${channel}`);
  process.exit(1);
}

console.log(`IPC contract OK: ${invokes.size} invoke channel(s), ${handlers.size} registered handler(s).`);
