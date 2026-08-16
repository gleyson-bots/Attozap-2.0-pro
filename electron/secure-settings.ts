import { safeStorage } from 'electron';
import type { AttozapDatabase } from './database.js';

const PREFIX = 'secure:';

function rowValue(db: AttozapDatabase, key: string) {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(`${PREFIX}${key}`) as { value?: string } | undefined;
  return row?.value;
}

export function secureStorageAvailable() {
  return safeStorage.isEncryptionAvailable();
}

export function getSecureSetting(db: AttozapDatabase, key: string) {
  const stored = rowValue(db, key);
  if (!stored?.startsWith('enc:') || !safeStorage.isEncryptionAvailable()) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
  } catch {
    return undefined;
  }
}

export function setSecureSetting(db: AttozapDatabase, key: string, value?: string) {
  const clean = String(value ?? '').trim();
  if (!clean) {
    db.prepare(`DELETE FROM settings WHERE key=?`).run(`${PREFIX}${key}`);
    return true;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O armazenamento protegido do sistema operacional não está disponível neste computador.');
  }
  const encrypted = safeStorage.encryptString(clean).toString('base64');
  db.prepare(`
    INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP
  `).run(`${PREFIX}${key}`, `enc:${encrypted}`);
  return true;
}

export function migratePlainSecret(db: AttozapDatabase, key: string) {
  if (!safeStorage.isEncryptionAvailable() || getSecureSetting(db, key)) return false;
  const legacy = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value?: string } | undefined;
  const clean = legacy?.value?.trim();
  if (!clean) return false;
  setSecureSetting(db, key, clean);
  db.prepare(`DELETE FROM settings WHERE key=?`).run(key);
  return true;
}
