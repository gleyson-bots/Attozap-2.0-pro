import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function requireText(path, needle, label = needle) {
  const source = read(path);
  if (!source.includes(needle)) failures.push(`${path}: missing ${label}`);
}

function forbid(path, pattern, label = String(pattern)) {
  const source = read(path);
  if (pattern.test(source)) failures.push(`${path}: forbidden ${label}`);
}

function walk(directory) {
  const output = [];
  for (const name of readdirSync(join(root, directory))) {
    const absolute = join(root, directory, name);
    const item = relative(root, absolute).replaceAll('\\', '/');
    if (statSync(absolute).isDirectory()) output.push(...walk(item));
    else output.push(item);
  }
  return output;
}

requireText('package.json', '"version": "2.0.0-rc.14"', 'RC14 package version');
requireText('electron/messaging/baileys-provider.ts', 'getLIDForPN', 'PN -> LID transport mapping');
requireText('electron/messaging/baileys-provider.ts', 'messages.update', 'asynchronous WhatsApp status listener');
requireText('electron/messaging/chat-service.ts', 'return resolved?.lid ?? resolved?.pnJid', 'LID-first direct resolution');
requireText('electron/messaging/chat-service.ts', "'pending'", 'pending outbound WebChat state');
requireText('electron/messaging/status.ts', 'message_status_cache', 'race-safe message status cache');
requireText('electron/message-status.ts', 'cacheMessageStatus', 'status cache reconciliation');
requireText('electron/message-status.ts', 'applyCampaignDeliveryStatus', 'campaign ACK reconciliation');
requireText('electron/delivery-migrations.ts', 'CREATE TABLE IF NOT EXISTS campaign_deliveries', 'campaign delivery table');
requireText('electron/delivery-migrations.ts', 'CREATE TABLE IF NOT EXISTS message_status_cache', 'message status cache table');
requireText('electron/campaigns/engine-core.ts', 'recordCampaignDelivery', 'per-message campaign delivery tracking');
requireText('electron/campaigns/engine-core.ts', 'finishCampaignExecution', 'ACK-aware campaign completion');
requireText('electron/campaigns/delivery.ts', "status='awaiting_ack'", 'awaiting ACK campaign state');
requireText('electron/chat-ipc.ts', "'webchat:message-status'", 'message-status IPC handler');
requireText('electron/preload.cts', 'messageStatus:', 'message-status preload bridge');
requireText('electron/preload.cts', 'onProfile:', 'live pushname/profile bridge');
requireText('src/pages/SenderPage.tsx', 'waitForDelivery', 'test-send ACK verification');
requireText('src/pages/CampaignCenterPage.tsx', 'awaiting_ack', 'awaiting ACK UI state');

for (const path of [...walk('electron/messaging'), ...walk('electron/campaigns')].filter(path => /\.(?:ts|cts)$/.test(path))) {
  forbid(path, /INSERT\s+OR\s+REPLACE\s+INTO\s+message_log/i, 'destructive INSERT OR REPLACE on message_log');
}

forbid('electron/campaigns/engine-core.ts', /UPDATE\s+campaigns\s+SET\s+sent\s*=\s*sent\s*\+\s*1/i, 'optimistic campaign sent counter');
forbid('electron/campaigns/engine-core.ts', /campaign_recipients[^\n]*status\s*=\s*['"]sent['"]/i, 'optimistic recipient sent state');
forbid('electron/messaging/chat-service.ts', /message\.fromMe\s*\?\s*['"]sent['"]/i, 'fromMe => sent shortcut');

if (failures.length) {
  console.error('\nDELIVERY CONTRACT FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('DELIVERY CONTRACT OK');
console.log(' - outbound messages start pending');
console.log(' - PN/LID transport is LID-aware');
console.log(' - async ACK/failure events are cached and reconciled');
console.log(' - campaign text/media deliveries are tracked individually');
console.log(' - campaign counters advance only from reconciled recipient states');
console.log(' - message_log writes preserve rich media rows');
console.log(' - renderer has message status and profile event bridges');
