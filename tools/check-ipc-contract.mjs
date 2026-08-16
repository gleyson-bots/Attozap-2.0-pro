import { readFile } from 'node:fs/promises';

const preloadPath = 'electron/preload.cts';
const handlerFiles = [
  'electron/main.ts',
  'electron/ipc.ts',
  'electron/extractor-ipc.ts',
  'electron/desktop-ipc.ts',
  'electron/chat-ipc.ts',
  'electron/warmup-ipc.ts',
  'electron/browser-hub-ipc.ts',
  'electron/recruiting-ipc.ts',
  'electron/system-ipc.ts',
];

const preload = await readFile(preloadPath, 'utf8');
const handlerSources = await Promise.all(handlerFiles.map(async path => ({ path, source: await readFile(path, 'utf8') })));

const invokes = new Set([...preload.matchAll(/invoke(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]));
const registrations = handlerSources.flatMap(({ path, source }) =>
  [...source.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)].map(match => ({ channel: match[1], path })),
);
const handlers = new Set(registrations.map(item => item.channel));
const missing = [...invokes].filter(channel => !handlers.has(channel)).sort();
const grouped = new Map();
for (const item of registrations) grouped.set(item.channel, [...(grouped.get(item.channel) ?? []), item.path]);
const duplicates = [...grouped.entries()].filter(([, paths]) => paths.length > 1).sort(([a], [b]) => a.localeCompare(b));

if (missing.length || duplicates.length) {
  if (missing.length) {
    console.error('IPC contract mismatch. Preload invokes channels without ipcMain.handle:');
    for (const channel of missing) console.error(`  - ${channel}`);
  }
  if (duplicates.length) {
    console.error('IPC contract mismatch. Duplicate ipcMain.handle registrations:');
    for (const [channel, paths] of duplicates) console.error(`  - ${channel}: ${paths.join(', ')}`);
  }
  process.exit(1);
}

console.log(`IPC contract OK: ${invokes.size} invoke channel(s), ${handlers.size} unique registered handler(s), no duplicates.`);
